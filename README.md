# Lee's Blog

English · [简体中文](./README.zh-CN.md)

Personal blog by Evo Lee — articles, works, and an admin dashboard. Single Node process serves a React SPA and a tRPC API backed by SQLite.

- **Frontend:** React 19, Vite 7, react-router v7, Tailwind v3 + shadcn/ui, GSAP, Lenis
- **Backend:** Hono + tRPC v11 (superjson), Drizzle ORM + better-sqlite3, DB-backed sessions (no JWT, no shared secret)
- **Images:** `sharp` pipeline → AVIF / WebP / JPEG at multiple widths; content-addressed filenames; `Sec-Fetch-Site` + Referer hotlink guard
- **Build:** Vite for the client, esbuild for the API → `dist/boot.js`
- **CLI:** `scripts/publish.ts` posts Markdown articles via `X-API-Key` (stored hashed)

---

## Quick start

```bash
# 1. Node.js 20.x or newer (project is ESM-only).
node -v

# 2. Install deps. Lockfile is npm — do not switch package managers.
npm install

# 3. Initialize the SQLite schema (creates ./blog.db by default).
npm run db:push

# 4. Dev server — Vite + Hono on http://localhost:3000 with HMR for both
#    the SPA and api/.
npm run dev
```

First admin: open `http://localhost:3000` (any path will do). The app detects
that no admin exists and forces a one-time setup screen — choose a username
and password, submit, and you land on the home page. After that, `/admin/login`
gets you back to the dashboard.

---

## Environment

All env vars are **optional**. The default SQLite path works for local dev and most deployments. Sessions are server-side (DB-backed) — there is no JWT secret to manage.

| Variable            | Required        | Notes                                                                                                                                      |
| ------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`      | no              | Override SQLite path. Default: `./blog.db`. For persistent volumes use e.g. `/data/blog.db`.                                               |
| `PORT`              | no              | Production listen port. Default: `3000`.                                                                                                   |
| `UPLOAD_DIR`        | no              | Image storage directory. Default: `./uploads/img`. Resolved to an absolute path at boot.                                                   |
| `UPLOAD_MAX_BYTES`  | no              | Per-file decoded size cap. Default: `10485760` (10 MB).                                                                                    |
| `IMG_MAX_PIXELS`    | no              | Pixel cap (`limitInputPixels`) for the sharp decompression-bomb guard. Default: `40000000`.                                                |
| `IMG_ALLOWED_HOSTS` | yes in prod     | Comma-separated `host:port` whitelist for the Referer fallback. Dev defaults to `localhost:3000,localhost`. Blank in prod = all Referer-bearing requests 403. |
| `TRUSTED_PROXY`     | no              | Set `1` only when running behind a known reverse proxy — otherwise `X-Forwarded-For` is ignored so the rate limiter can't be spoofed.      |
| `RUN_SEED`          | no              | Set `1` to invoke `db/seed.ts` directly. The seed function is otherwise dormant inside the prod bundle.                                    |

---

## Commands

```bash
npm run dev          # Vite + Hono dev server on :3000 (HMR for client and api/)
npm run build        # vite build → dist/public + esbuild api/boot.ts → dist/boot.js
npm start            # NODE_ENV=production node dist/boot.js
npm test             # vitest run
npm run check        # tsc -b — type-check all tsconfig projects
npm run lint         # eslint .
npm run format       # prettier --write .
npm run db:generate  # drizzle-kit generate (schema → migration SQL)
npm run db:migrate   # drizzle-kit migrate (apply migrations)
npm run db:push      # drizzle-kit push (sync schema directly, dev-only)
```

---

## Architecture

In dev, a single Vite process serves the client AND mounts the Hono API via `@hono/vite-dev-server` with `entry: "api/boot.ts"`. In production, `npm start` runs the bundled `dist/boot.js`, which serves the SPA from `dist/public` and the API on `/api/*`.

### Layout

| Path       | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/`     | React SPA. `App.tsx` route table, pages in `pages/`, sections in `sections/`, shadcn in `components/ui/`, providers in `providers/`, hooks in `hooks/`, i18n in `i18n/`.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `api/`     | Hono server. `boot.ts` mounts `/api/trpc/*` + `/api/publish`, runs `cleanupExpired()` hourly, and performs the one-shot legacy API-key cleanup. `router.ts` composes `post`, `work`, `auth`, `settings`, and `comment` routers. `middleware.ts` defines `publicQuery` / `authedQuery` / `adminQuery`. `sessions.ts` issues / verifies / revokes DB-backed sessions and 2FA login challenges. `cookies.ts` is the shared session-cookie helper (HttpOnly, SameSite=Lax, Secure-in-prod). `context.ts` resolves `user` + `authMethod` from session cookie or hashed `x-api-key`. |
| `db/`      | Drizzle schema (`schema.ts`), shared site defaults (`site-defaults.ts`), `relations.ts`, `seed.ts`, generated `migrations/`. Imported via `@db/*` or plain `db/*`.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `scripts/` | `publish.ts` — Node CLI for publishing Markdown articles via `X-API-Key`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `public/`  | Static assets served at the root.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `dist/`    | Build output. `dist/public/` = client, `dist/boot.js` = bundled server.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### Path aliases

`vite.config.ts` and `tsconfig.json` agree on:

- `@/*` → `src/*`
- `@db/*` and `db/*` → `db/*`

### Data

SQLite via `better-sqlite3`. Tables: `users`, `sessions`, `login_challenges`, `posts`, `comments`, `site_settings`, `works`, `work_details`, `work_tags`, `images`. `users` carries both `totp_secret` (verified) and `pending_totp_secret` (written by `setup2FA`, promoted on `verify2FA`). `users.api_key` stores only a SHA-256 hex digest of the plaintext API key. `posts.content` and `work_details.content` are stored as JSON-stringified paragraph arrays — `parseContent` in `api/routers/post.ts` returns `[]` on corrupt rows so a bad row can't crash a request. `images` stores uploaded image metadata (16-hex `hash`, `variants` JSON, FK `uploaded_by` → `users`); the actual files live under `UPLOAD_DIR`. Body limit on the API is 50 MB (`api/boot.ts`).

`site_settings` is a single-row table (`id=1`) seeded from `db/site-defaults.ts`. It drives the header/footer site title, localized hero copy, ICP / public security filing numbers, and localized copyright text. `comments` stores public article comments; public submissions are pending by default and become visible only after admin approval.

Fresh deployments keep the generated starter posts: on server startup, `api/boot.ts` inserts `seedData.posts` from `db/seed.ts` only when the `posts` table is empty. Once any post exists, startup seeding is skipped so new writing can replace the defaults gradually.

### Auth

DB-backed sessions, no JWT. The cookie holds an opaque 32-byte random token; the DB stores its SHA-256 hash in the `sessions` table (7-day TTL, `HttpOnly`, `SameSite=Lax`, `Secure` in production). Logout `DELETE`s the row, so revocation is real. The 2FA login flow uses a separate `login_challenges` table (5-minute TTL, single-use) to bridge step 1 → step 2. The CLI uses an `x-api-key` header; the server hashes the plaintext header and matches the digest against `users.api_key`. Generated API keys are shown once, then stored only as SHA-256. On startup, legacy plaintext API keys are nulled if their stored value is not a 64-character digest, so affected admins must regenerate a key from `/admin`.

`authedQuery` accepts either auth method. **`adminQuery` requires session-cookie auth and rejects API-key auth with 403** — a leaked CLI publish key cannot delete posts, moderate comments, edit site settings, rotate keys, or change 2FA. The auth method is exposed as `ctx.authMethod` (`"session"` or `"apikey"`).

2FA setup uses a pending → active pattern: `setup2FA` writes to `users.pending_totp_secret`; `verify2FA` validates the authenticator code and promotes it to `users.totp_secret`; `cancel2FASetup` clears the pending value. Closing the QR page mid-setup no longer locks the account. Admins can remove active 2FA through `disable2FA`, then set it up again.

Every registered user is treated as admin today (single-admin blog). See `CLAUDE.md` for the multi-user TODO.

### Admin dashboard

`/admin` is split into focused panels:

- `SecurityPanel` handles 2FA and API key generation / revocation.
- `PostsPanel` lists posts and uses a shared confirm button for deletion.
- `CommentsPanel` reviews pending / approved comments and can approve, unapprove, or delete them.
- `ImageUploadPanel` uploads images (drop or click), lists existing uploads with copy-ref / delete actions, and surfaces tRPC errors inline (e.g. `BAD_REQUEST: Image is referenced by post(s): ...`).
- `SiteSettingsPanel` edits the single `site_settings` row without clobbering unsaved local edits on query refetch.

### Public article rendering

Article bodies render through `src/components/ArticleMarkdown.tsx` with `react-markdown` + `remark-gfm`. The first paragraph still gets the drop-cap treatment, while the remaining paragraphs render as normal Markdown. `post.bySlug` returns `{ post, images }` where `images` is a `Record<hash, ImageRef>` populated from every `hash:<16hex>` reference in the content body and `cover_image`. `ArticleMarkdown` routes `![alt](hash:<16hex>)` srcs through `BlogImage` (a `<picture>` with AVIF → WebP → JPEG fallback); unknown hashes render `BrokenImage`, and external URLs fall through to a plain `<img>`. `src/components/Comments.tsx` is mounted below each article and submits pending comments with a hidden honeypot field.

### Images

Admin-uploaded images go through `api/lib/images.ts:processUpload`: size cap → magic-byte sniff (`file-type`; whitelist JPEG / PNG / WebP / AVIF, GIF / SVG / HEIC / TIFF rejected) → pixel cap via `sharp({ limitInputPixels })` → `sha256(input).slice(0, 16)` hash → DB short-circuit (re-uploads return the existing row) → Cartesian product of widths `[480, 960, 1920]` × formats `[avif, webp, jpeg]`, never upscaling. Files are written atomically (`.tmp` → `rename`), and a partial failure unlinks every variant written so far. `cleanupTmpFiles` sweeps orphan `.tmp` files at boot.

Embed an image in a post with `![alt](hash:<16hex>)`. Deleting an image first scans `posts.content` (LIKE) and `posts.cover_image` (eq) — if any post references the hash, the call rejects with `BAD_REQUEST` and the offending slug list, so links can't silently break.

Static delivery: `/uploads/img/*` runs through `api/middleware/imageGuard.ts` (`Sec-Fetch-Site` primary, exact-host Referer fallback against `IMG_ALLOWED_HOSTS`, 200 req/min in-memory rate limit) ahead of `serveStatic`. Responses carry `Cache-Control: public, max-age=31536000, immutable` because hashed filenames are content-addressed. This is "casual abuse reduction" — it stops typical browser hotlinks but does not defeat `curl`/non-browser scrapers (no SFS sent → fallback allows empty Referer, since images are public assets).

### First-run flow

`App.tsx` wraps every route in a `SetupGuard`. While no admin exists, **any URL** renders the one-time setup screen. After the admin is created, the guard releases and the user is redirected to `/`. There is no public `/admin/setup` URL.

---

## Testing

`vitest` is wired up via `npm test` and `vitest.config.ts`. Coverage today includes the auth / 2FA flow, the image pipeline (`api/lib/images.test.ts`), reference scanning (`api/lib/imageRefs.test.ts`), the hotlink guard (`api/middleware/imageGuard.test.ts`), delete safety, the upload router, and the `post.bySlug` images-map injection. Test discovery globs `api/**/*.test.ts`, `api/**/*.spec.ts`, and `src/**/*.test.ts`.

Run a single file:

```bash
npx vitest run api/path/to/file.test.ts
```

`npm run check` (TypeScript) and `npm run lint` (ESLint) are the other two correctness gates.

### Manual smoke test

```bash
npm run dev
# In another shell:
curl -s http://localhost:3000/api/trpc/post.list?batch=1\&input=%7B%220%22%3A%7B%22json%22%3A%7B%22page%22%3A1%2C%22perPage%22%3A10%7D%7D%7D
```

Pages worth eyeballing: `/`, `/articles`, `/article/:slug`, `/works`, `/works/:slug`, `/about`, `/admin`, `/admin/login`, `/admin/new`. (The setup screen is a global overlay rendered before any admin exists — it has no dedicated URL.)

---

## Publishing articles via CLI

`scripts/publish.ts` accepts a Markdown file with frontmatter and POSTs it to `/api/publish` using an API key.

1. Generate an API key from `/admin` → **API Key** → **Generate Key** (copy it once — it is not shown again).

2. Either set `LEEBLOG_API_KEY` in your shell, or write `~/.leeblog.json`:

   ```json
   { "server": "https://your-blog.example", "apiKey": "lb_..." }
   ```

3. Publish:

   ```bash
   npx tsx scripts/publish.ts ./article.md
   # or with explicit overrides:
   npx tsx scripts/publish.ts ./article.md --server=https://your-blog.example --api-key=lb_...
   ```

Article body must be paragraphs separated by blank lines — the endpoint splits on those and stores the result as a JSON array. Those paragraph strings may contain Markdown/GFM syntax and are rendered on the article page. Duplicate slugs return HTTP 409.

---

## Production

### Bare Node

```bash
npm run build
npm run db:push          # only on first run, or when schema changes
npm start                # → http://localhost:3000
```

The production bundle is ESM, but `better-sqlite3` **and** `sharp` both load native `.node` bindings at runtime. Keep them both external in the esbuild command (`--external:better-sqlite3 --external:sharp`) and inject `require`, `__filename`, and `__dirname` via the esbuild banner. Without that, production logs can show `__filename is not defined` or `Could not locate the bindings file` while the HTTP server still appears to start.

The `uploads/` directory is git-ignored and the only on-disk copy of admin-uploaded images — back it up alongside `blog.db`.

The first visit to the deployed site forces the setup overlay — create the admin account immediately after deploy to avoid leaving the door open.

### Docker

```bash
docker build -t lee-blog .
docker run --rm -p 3000:3000 \
  -e IMG_ALLOWED_HOSTS=your-domain.example \
  -v $(pwd)/data:/data \
  lee-blog
```

The image defaults to `DATABASE_URL=/data/blog.db` and `UPLOAD_DIR=/data/uploads/img`, so mount `/data` as the persistent volume. Do not bake `.env` into the image; pass runtime env vars from `docker run`, `docker compose`, or the VPS host.

### Cloudflare Pages / Render / fly.io

Anywhere with a persistent volume works: point `DATABASE_URL` at the mount path (e.g. `/data/blog.db`). Visit the deployed URL right after the first build to claim the admin account before anyone else can.

---

## Conventions

- tRPC procedures use the `superjson` transformer; `Date`, `BigInt`, `Map` serialize transparently.
- React Query is the client cache (`@tanstack/react-query` via `@trpc/react-query`); provider in `src/providers/trpc.tsx`.
- Tailwind v3 + a shadcn theme. Use `cn()` from `src/lib/utils.ts` to merge class names.
- The `/api/publish` endpoint validates that `content` is an array of paragraph strings and rejects duplicate slugs with 409.
- Search input is trimmed, length-limited, and SQLite LIKE wildcards are escaped before querying published posts.

## Known gotchas

- The setup overlay is **first-visitor-wins** by design (no terminal-based token, to keep Cloudflare-style deploys workable). After deploying, hit the URL immediately and claim the admin account.
- Production schema changes go through `npm run db:migrate`; `db:push` is dev-only because it bypasses the migration journal.
- Empty databases are automatically seeded with the generated starter posts on server startup; this is skipped as soon as any post exists. `db/seed.ts` itself only runs when `RUN_SEED=1` — the prior `import.meta.url` main-module gate collapsed inside the prod bundle and caused UNIQUE violations on every restart.
- Existing API keys generated before the hashed-key change are invalidated on server startup; regenerate them in `/admin`.
- Do not bundle `better-sqlite3` **or `sharp`** into `dist/boot.js`; both must load from `node_modules` so their native binding paths remain valid.
- `uploads/` is git-ignored — back it up alongside `blog.db` or images will be lost on redeploy.
- The image hotlink guard is casual abuse reduction, not a strong access control: `curl` requests with no `Sec-Fetch-Site` and no Referer are allowed through, because images are public assets.
- Docker images keep SQLite and uploads outside the image under `/data`; keep that volume when replacing containers.

---

## License

Personal project. No license granted; do not redistribute without permission.
