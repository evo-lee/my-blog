# [CLAUDE.md](http://CLAUDE.md)

Personal blog (Lee's Blog). Full-stack TypeScript app — React SPA + Hono/tRPC API + SQLite, served as one Node process in production.

## Prerequisites

First-run setup before any `npm` command:

1. **Node.js**: 20.x or newer (ESM-only project, `"type": "module"`).
2. **Install deps**: `npm install` (uses `package-lock.json`; do not switch to pnpm/yarn).
3. **Env file**: optional. Defaults work for local dev. Only set `DATABASE_URL` if you need a non-default SQLite path. No JWT secret required (sessions are server-side).
4. **DB init**: `npm run db:push` creates SQLite tables at `DATABASE_URL` path (default `./blog.db`).
5. **Admin account**: on first visit to `localhost:3000` (any path), the app forces a one-time setup page to create the admin username + password.
6. **Optional CLI auth**: for `scripts/publish.ts`, write `~/.leeblog.json` with `{ "apiKey": "..." }` matching a row in `users.api_key`, or set `LEEBLOG_API_KEY`.

## Commands

```bash
npm run dev          # Vite + Hono dev server on :3000 (HMR for both client and api/)
npm run build        # vite build (client → dist/public) + esbuild api/boot.ts (→ dist/boot.js)
npm start            # NODE_ENV=production node dist/boot.js
npm test             # vitest run
npm run check        # tsc -b (type-check all tsconfig projects)
npm run lint         # eslint .
npm run format       # prettier --write .
npm run db:generate  # drizzle-kit generate (schema → migration SQL)
npm run db:migrate   # drizzle-kit migrate (apply migrations)
npm run db:push      # drizzle-kit push (sync schema directly, dev)
```

Run a single test under the current include pattern: `npx vitest run api/path/to/file.test.ts`.

## Architecture

Single Vite process serves both the React client and the Hono API in dev (via `@hono/vite-dev-server` with `entry: "api/boot.ts"`). In production `npm start` runs the bundled `dist/boot.js` which mounts the SPA from `dist/public` and the API on `/api/*`.

### Layout

- `src/` — React 19 SPA. `App.tsx` is the route table (react-router v7). Pages in `src/pages/`, layout sections in `src/sections/`, shadcn primitives in `src/components/ui/`, providers in `src/providers/`, hooks in `src/hooks/`, i18n in `src/i18n/`.
- `api/` — Hono server. `boot.ts` mounts `/api/trpc/*` (tRPC fetch adapter) and `/api/publish` (REST endpoint for the CLI), runs `cleanupExpired()` on startup + hourly, and nulls legacy plaintext API keys on startup. `router.ts` composes feature routers from `routers/` (`post`, `work`, `auth`, `settings`, `comment`). `middleware.ts` defines `publicQuery` / `authedQuery` / `adminQuery` procedures. `context.ts` builds the per-request `TrpcContext` (resolves `user` and `authMethod` from session cookie or hashed `x-api-key` header). `sessions.ts` issues/verifies/revokes DB-backed sessions and 2FA login challenges. `cookies.ts` defines the shared session-cookie helpers (HttpOnly, SameSite=Lax, `Secure` in production, 7-day Max-Age). `lib/words.ts` is the publish-side word-count helper (returns 0 for empty input). `queries/connection.ts` is the singleton Drizzle client. `lib/env.ts` exposes runtime flags (just `isProduction` today).
- `db/` — Drizzle schema (`schema.ts`), shared site defaults (`site-defaults.ts`), relations (`relations.ts`), seed (`seed.ts`), generated migrations (`migrations/`). Imported via `@db/*` (also aliased as plain `db`).
- `scripts/publish.ts` — Node CLI that POSTs Markdown articles (with frontmatter) to `/api/publish` using an `X-API-Key`. Reads `~/.leeblog.json` or `LEEBLOG_API_KEY`.

### Path aliases (`vite.config.ts` + `tsconfig.json`)

- `@/*` → `src/*`
- `@db/*` and `db/*` → `db/*`

### Data

SQLite via `better-sqlite3`. DB file path comes from `DATABASE_URL` (e.g. `sqlite:./blog.db`), default `./blog.db`. Tables: `users`, `sessions`, `login_challenges`, `posts`, `comments`, `site_settings`, `works`, `work_details`, `work_tags`. `users` carries both `totp_secret` (verified) and `pending_totp_secret` (set during `setup2FA`, promoted on `verify2FA`). `users.api_key` stores only a SHA-256 hex digest. `posts.content` and `work_details.content` are stored as JSON-stringified paragraph arrays — the `parseContent` helper in `routers/post.ts` returns `[]` on corrupt rows so a bad row can't crash a request.

`api/queries/connection.ts` runs `PRAGMA foreign_keys = ON` at construction. This makes `ON DELETE CASCADE` actually enforced — required for the nested-comment cascade and for the reply-submit race handling (a deleted parent triggers `SQLITE_CONSTRAINT_FOREIGNKEY`, which the comment router maps to tRPC `CONFLICT`).

`site_settings` is a single-row table (`id=1`) seeded from `db/site-defaults.ts` and exposed through `api/routers/settings.ts`; it drives header/footer title, localized hero copy, ICP / public security filing numbers, localized copyright text, and the analytics provider configuration (see "Analytics" below). `comments` stores article comments; public submissions are pending by default and only approved comments are returned to public article pages. `comments.parent_id` self-references `comments.id` with `ON DELETE CASCADE` to support 1-level threading.

**Migrations.** Production schema changes go through Drizzle migrations in `db/migrations/`. Run `npm run db:migrate` on deploy. `db:push` is dev-only — it bypasses the migration journal. The baseline migration (`0000_*.sql`) uses `CREATE TABLE IF NOT EXISTS` so it can run safely against databases that were originally created via `db:push`.

Fresh deployments auto-seed generated starter posts. `api/boot.ts` inserts `seedData.posts` from `db/seed.ts` only when `posts` is empty; existing databases are left untouched so real writing can gradually replace the generated defaults.

### Auth

DB-backed sessions, **no JWT, no shared secret**. The cookie holds an opaque 32-byte random token; the DB stores its SHA-256 hash in the `sessions` table. 7-day TTL, `HttpOnly`, `SameSite=Lax`, `Secure` in production. Logout actually `DELETE`s the row, so revocation is real. The 2FA login flow uses a separate short-lived `login_challenges` table (5-min TTL, single-use) to bridge step 1 → step 2. The CLI uses an `x-api-key` header; the server hashes the plaintext header and matches that digest against `users.api_key`. `auth.generateApiKey` returns plaintext once, stores only SHA-256, and `boot.ts` nulls legacy non-64-character stored values so admins regenerate old keys.

`authedQuery` accepts either auth method (session cookie OR API key). **`adminQuery` requires session-cookie auth and rejects API-key auth (403).** A leaked CLI publish key cannot delete posts, moderate comments, edit site settings, rotate keys, or change 2FA — admin actions must come from the browser. The auth method is exposed as `ctx.authMethod` (`"session"` or `"apikey"`).

2FA setup is a two-step pending → active dance: `setup2FA` writes the secret to `users.pending_totp_secret`; `verify2FA` checks the TOTP code and promotes pending → `users.totp_secret`; `cancel2FASetup` clears the pending value. Closing the QR page mid-setup no longer locks the account into an unverified TOTP. `disable2FA` removes active and pending secrets so the admin can set 2FA up again.

There is no separate admin **role** today — every registered user is treated as admin. `SetupGuard` prevents public registration entirely (only the first-visit setup screen creates a user), so this is fine for a single-admin blog.

> **TODO (multi-user)**: if you ever open registration, add `users.role` and a role check in `adminMiddleware`. The auth-method gate is necessary but not sufficient — multiple humans would need real role-based authorization.

### Admin dashboard

`/admin` renders `SecurityPanel` above a tabbed area:

- `PostsPanel` lists posts and uses `ConfirmButton` before deletion.
- `CommentsPanel` filters pending / approved / all comments, then approves, unapproves, or deletes.
- `ImageUploadPanel` uploads images (multi-file drop or click), lists existing uploads with copy-ref / delete actions, and surfaces tRPC errors inline (e.g. `BAD_REQUEST: Image is referenced by post(s): ...`).
- `SiteSettingsPanel` edits the single `site_settings` row. It hydrates form state once on first load so focus/refetch does not overwrite unsaved edits.

### Article rendering

`ArticleDetail.tsx` delegates article body rendering to `src/components/ArticleMarkdown.tsx` (`react-markdown` + `remark-gfm`). The first paragraph gets the drop cap, remaining paragraphs render as normal Markdown. `post.bySlug` returns `{ post, images }` where `images` is a `Record<hash, ImageRef>` populated by `api/lib/imageRefs.ts:loadImageMap` for every `hash:<16hex>` ref found in `content` or `cover_image`. `ArticleMarkdown` accepts the map and routes `![alt](hash:<16hex>)` srcs through `BlogImage` (with `<picture>` AVIF→WebP→JPEG fallback); unknown hashes render `BrokenImage`; any other src (e.g. external URLs) renders a plain `<img>`. `src/components/Comments.tsx` mounts below the article body, lists approved comments + their approved replies, and submits new comments as pending with a hidden honeypot field.

### Comments

- **Threading**: one level deep. `comments.parent_id` points at a top-level comment whose own `parent_id` is `NULL`. The submit path rejects replies-to-replies (`BAD_REQUEST`), replies whose parent is on a different post (`BAD_REQUEST`), and replies whose parent vanished mid-flight (FK pragma → `CONFLICT`).
- **Public visibility**: `listForPost` returns only top-level approved comments and their approved replies. A reply under an unapproved or deleted parent is hidden publicly, even if the reply itself is approved.
- **Moderation semantics**:
  - Delete parent → replies cascade out via FK.
  - Unapprove parent → replies stay in the DB but become invisible publicly (parent gate).
  - Approve a reply whose parent is still unapproved → allowed in admin, but the reply remains publicly hidden until the parent is approved too.
- **Ordering**: top-level comments are newest-first (`created_at DESC`); replies under each parent are oldest-first (`created_at ASC`).
- **Avatars**: `src/components/PixelAvatar.tsx` renders a deterministic 8×8 symmetric grid seeded by the lowercased commenter name. Email is never sent to the client, so it can't be part of the seed.

### Analytics

`site_settings` holds three analytics fields: `ga_measurement_id`, `umami_site_id`, and `umami_script_url`. Each integration toggles on independently — blank fields = disabled, and both can run side-by-side. `api/lib/analytics.ts` validates in the settings router:

- **GA4** — when `ga_measurement_id` is non-blank it must match `^G-[A-Z0-9]{6,}$`.
- **Umami** — `umami_site_id` and `umami_script_url` must both be present or both blank. The id must be a UUID; the URL must parse and use the `https:` scheme.

`src/components/AnalyticsLoader.tsx` is mounted once near the root of `App.tsx`. It runs only when `import.meta.env.PROD`, builds both payloads via `src/lib/analyticsLoader.ts` (`buildGooglePayload` + `buildUmamiPayload`), and injects whichever are non-null. The GA injection includes an inline bootstrap so `window.gtag` exists before page tracking fires. The loader is idempotent via `__gaInit` / `__umamiInit` sentinels and removes its own injected `<script>` nodes when the active set changes; third-party globals are intentionally not unwound on teardown.

`src/hooks/usePageTracking.ts` is the consumer side — it calls `window.gtag(...)` and `window.umami.track(...)` on every route change. Without the loader those calls silently no-op, so the loader must mount above `<Routes>`.

If a `Content-Security-Policy` header is ever added in front of this app, `script-src` needs `https://www.googletagmanager.com` (GA) and/or the configured Umami host (Umami). Today no CSP is set; verify before turning analytics on.

### Images

Admin-uploaded images live in the `images` table and on disk under `UPLOAD_DIR` (default `./uploads/img`, resolved to an absolute path at boot). The pipeline (`api/lib/images.ts:processUpload`) validates in order: size cap (`UPLOAD_MAX_BYTES`, default 10 MB), magic-byte sniff via `file-type` (whitelist: `image/jpeg`, `image/png`, `image/webp`, `image/avif` — **GIF/SVG/HEIC/TIFF rejected**), pixel cap (`IMG_MAX_PIXELS`, default 40 M, passed to `sharp` as `limitInputPixels`). The hash is `sha256(input).slice(0, 16)` — re-uploading the same buffer returns the existing row without re-encoding (`findImageByHash` short-circuit).

For each accepted image, `sharp` emits a Cartesian product of widths `[480, 960, 1920]` × formats `[avif, webp, jpeg]`, never upscaling. Smaller source images get fewer variants (e.g. 300px source → 3 variants at native width; 800px source → 6 at 480 + 800). Files are named `<hash>-<width>.<format>` and written atomically via `.tmp` → `rename`; if any variant fails, all already-written variants for that upload are unlinked. `cleanupTmpFiles` runs at boot to sweep orphan `.tmp` files left by a crash mid-upload.

**Markdown ref syntax.** Embed an image with `![alt](hash:<16hex>)`. The `bySlug` query scans `posts.content` for matches plus checks if `posts.cover_image` itself equals `hash:<16hex>`, then returns a populated `images` map keyed by hash. `ArticleMarkdown` resolves the map at render time — unknown hashes render `BrokenImage`, non-hash srcs (external URLs) fall through to plain `<img>`.

**Delete safety.** `api/lib/imageDelete.ts:deleteImage` first runs `assertNoRefs` (scans `posts.content` LIKE + `posts.cover_image` eq); if any post references the hash, the call rejects with `BAD_REQUEST` listing the offending slugs. On success it deletes the DB row first, then unlinks files via `Promise.allSettled` — unlink failures leave orphan files but the DB row (source of truth) is gone, so they can't reappear. A future cron sweep is left to v2.

**Static serving + hotlink guard.** `/uploads/img/*` is mounted in `api/boot.ts` ahead of `@hono/node-server/serve-static`. The middleware (`api/middleware/imageGuard.ts`) checks `Sec-Fetch-Site` first (`cross-site` → 403; `same-origin` / `same-site` / `none` → allow); when SFS is missing it falls back to an exact-host check against `IMG_ALLOWED_HOSTS`. A 200-req/min in-memory bucket gates per-IP volume. The response carries `Cache-Control: public, max-age=31536000, immutable` because content-addressed filenames make new content always equal a new URL. **Realistic threat model**: this stops typical browser hotlinks but does **not** defeat `curl`/non-browser scrapers (no SFS sent → fallback allows empty Referer, since images are public assets); the guard is "casual abuse reduction," not a strong access control.

**Vite dev integration.** `vite.config.ts` `devServer({ exclude: /^\/(?!api\/|uploads\/).*$/ })` lets `/uploads/*` reach the Hono dev server — without this, the guard would not fire in dev and behavior would diverge between dev and prod.

**Bundling.** Like `better-sqlite3`, `sharp` is a native module and must be kept `--external:sharp` in the esbuild command; bundling it breaks the prebuilt binary lookup on the deploy target.

### i18n

`src/i18n/I18nProvider.tsx` resolves the initial language with a lazy `useState` initializer (no `useEffect` flash). Precedence:

1. `localStorage.lang` if set to `'en'` or `'zh'`.
2. `navigator.language` — anything matching `/^zh/i` selects Chinese.
3. Default `'en'`.

The provider persists every switch to `localStorage` and keeps `document.documentElement.lang` in sync (`en` or `zh-CN`). The hardcoded `lang="en"` in `index.html` is just the pre-mount bootstrap value. Public copy lives in `src/i18n/translations.ts`; the admin dashboard stays English by design.

### First-run flow

The home `App.tsx` wraps routes in a `SetupGuard` component. It calls `auth.isSetup`; while no admin exists, **any URL** renders the `AdminSetup` page instead of the requested route. After the admin is created, the query is invalidated and the user is redirected to `/`. Direct `/admin/setup` routes no longer exist.

### Env vars

All optional unless noted. `DATABASE_URL` overrides the default SQLite path (`./blog.db`). No JWT/secret env vars exist — the auth system manages its own randomness. Image-pipeline knobs:

| key | default | notes |
|-----|---------|-------|
| `UPLOAD_DIR` | `./uploads/img` | resolved to absolute path at boot |
| `UPLOAD_MAX_BYTES` | `10485760` | decoded binary size cap |
| `IMG_MAX_PIXELS` | `40000000` | passed to `sharp` as `limitInputPixels` |
| `IMG_ALLOWED_HOSTS` | dev `localhost:3000,localhost`; prod required | Referer fallback whitelist; comma-separated `host:port`. In prod, blank → all Referer-bearing requests 403 (forces explicit config) |
| `TRUSTED_PROXY` | `0` | set `1` only behind a known reverse proxy; otherwise `X-Forwarded-For` is ignored to prevent IP spoofing of the rate limiter |
| `RUN_SEED` | unset | set `1` to invoke `db/seed.ts` directly (otherwise the seed function is dormant inside the prod bundle) |

### Production bundling

The server bundle is ESM. **`better-sqlite3` and `sharp` must both stay external** (`--external:better-sqlite3 --external:sharp`) in the esbuild command — both ship native `.node` bindings that are resolved relative to the real `node_modules/` package at runtime; bundling them produces `Could not locate the bindings file` on the deploy target. The build banner also defines `require`, `__filename`, and `__dirname` for CommonJS dependencies inside the ESM bundle. Removing either piece can produce `__filename is not defined` during API-key migration / session cleanup on VPS deployments.

## Conventions

- tRPC procedures use `superjson` transformer — Date/BigInt/Map serialize transparently.
- React Query is the client cache (`@tanstack/react-query` via `@trpc/react-query`); provider in `src/providers/trpc.tsx`.
- Styling: Tailwind v3 + shadcn theme. Use `cn()` from `src/lib/utils.ts` to merge class names.
- Body limit on the API is 50 MB (set in `api/boot.ts`).
- The `/api/publish` REST endpoint validates that `content` is an array of paragraph strings and rejects duplicate slugs with 409.
- Post search trims input, limits it to 100 chars, and escapes SQLite LIKE wildcards before querying.

## Things to know

- The first-run setup overlay is **first-visitor-wins** by design (no terminal-based setup token, to keep ephemeral-filesystem deploys workable). Hit the URL immediately after deploying.
- Existing API keys generated before the hashed-key change are invalidated on server startup; regenerate them from `/admin`.
- Empty databases auto-seed generated starter posts on startup; this is skipped once any post exists.
- Keep `better-sqlite3` **and `sharp`** external in esbuild; bundling either breaks native binding lookup in production.
- Production schema changes go through `npm run db:migrate`. `db:push` is dev-only.
- `db/seed.ts` only runs when `RUN_SEED=1` is set. The previous `import.meta.url`-based gate fired inside the prod bundle (because esbuild rewrites both sides to the bundled module path) and crashed every restart on UNIQUE violations.
- `uploads/` is ignored by git. Images live there and on disk are the only copy — back the directory up alongside `blog.db`.
- `info.md` is a leftover scaffolding log from initial shadcn setup; safe to delete, not part of the source.
