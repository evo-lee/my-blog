# Lee's Blog

English · [简体中文](./README.zh-CN.md)

Personal blog by Evo Lee — articles, works, and an admin dashboard. Single Node process serves a React SPA and a tRPC API backed by SQLite.

- **Frontend:** React 19, Vite 7, react-router v7, Tailwind v3 + shadcn/ui, GSAP, Lenis
- **Backend:** Hono + tRPC v11 (superjson), Drizzle ORM + better-sqlite3, DB-backed sessions (no JWT, no shared secret)
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

| Variable       | Required | Notes                                                                                        |
| -------------- | -------- | -------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | no       | Override SQLite path. Default: `./blog.db`. For persistent volumes use e.g. `/data/blog.db`. |
| `PORT`         | no       | Production listen port. Default: `3000`.                                                     |

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

| Path         | Purpose                                                                                                                                                                                                                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`       | React SPA. `App.tsx` route table, pages in `pages/`, sections in `sections/`, shadcn in `components/ui/`, providers in `providers/`, hooks in `hooks/`, i18n in `i18n/`.                                                                                                                                                                             |
| `api/`       | Hono server. `boot.ts` mounts `/api/trpc/*` + `/api/publish`, runs `cleanupExpired()` hourly, and performs the one-shot legacy API-key cleanup. `router.ts` composes `post`, `work`, `auth`, `settings`, and `comment` routers. `middleware.ts` defines `publicQuery` / `authedQuery` / `adminQuery`. `sessions.ts` issues / verifies / revokes DB-backed sessions and 2FA login challenges. `cookies.ts` is the shared session-cookie helper (HttpOnly, SameSite=Lax, Secure-in-prod). `context.ts` resolves `user` + `authMethod` from session cookie or hashed `x-api-key`. |
| `db/`        | Drizzle schema (`schema.ts`), shared site defaults (`site-defaults.ts`), `relations.ts`, `seed.ts`, generated `migrations/`. Imported via `@db/*` or plain `db/*`.                                                                                                                                                                                               |
| `scripts/`   | `publish.ts` — Node CLI for publishing Markdown articles via `X-API-Key`.                                                                                                                                                                                                                                                                            |
| `public/`    | Static assets served at the root.                                                                                                                                                                                                                                                                                                                    |
| `dist/`      | Build output. `dist/public/` = client, `dist/boot.js` = bundled server.                                                                                                                                                                                                                                                                              |

### Path aliases

`vite.config.ts` and `tsconfig.json` agree on:

- `@/*` → `src/*`
- `@db/*` and `db/*` → `db/*`

### Data

SQLite via `better-sqlite3`. Tables: `users`, `sessions`, `login_challenges`, `posts`, `comments`, `site_settings`, `works`, `work_details`, `work_tags`. `users` carries both `totp_secret` (verified) and `pending_totp_secret` (written by `setup2FA`, promoted on `verify2FA`). `users.api_key` stores only a SHA-256 hex digest of the plaintext API key. `posts.content` and `work_details.content` are stored as JSON-stringified paragraph arrays — `parseContent` in `api/routers/post.ts` returns `[]` on corrupt rows so a bad row can't crash a request. Body limit on the API is 50 MB (`api/boot.ts`).

`site_settings` is a single-row table (`id=1`) seeded from `db/site-defaults.ts`. It drives the header/footer site title, localized hero copy, ICP / public security filing numbers, and localized copyright text. `comments` stores public article comments; public submissions are pending by default and become visible only after admin approval.

### Auth

DB-backed sessions, no JWT. The cookie holds an opaque 32-byte random token; the DB stores its SHA-256 hash in the `sessions` table (7-day TTL, `HttpOnly`, `SameSite=Lax`, `Secure` in production). Logout `DELETE`s the row, so revocation is real. The 2FA login flow uses a separate `login_challenges` table (5-minute TTL, single-use) to bridge step 1 → step 2. The CLI uses an `x-api-key` header; the server hashes the plaintext header and matches the digest against `users.api_key`. Generated API keys are shown once, then stored only as SHA-256. On startup, legacy plaintext API keys are nulled if their stored value is not a 64-character digest, so affected admins must regenerate a key from `/admin`.

`authedQuery` accepts either auth method. **`adminQuery` requires session-cookie auth and rejects API-key auth with 403** — a leaked CLI publish key cannot delete posts, moderate comments, edit site settings, rotate keys, or change 2FA. The auth method is exposed as `ctx.authMethod` (`"session"` or `"apikey"`).

2FA setup uses a pending → active pattern: `setup2FA` writes to `users.pending_totp_secret`; `verify2FA` validates and promotes to `users.totp_secret`; `cancel2FASetup` clears the pending value. Closing the QR page mid-setup no longer locks the account.

Every registered user is treated as admin today (single-admin blog). See `CLAUDE.md` for the multi-user TODO.

### Admin dashboard

`/admin` is split into focused panels:

- `SecurityPanel` handles 2FA and API key generation / revocation.
- `PostsPanel` lists posts and uses a shared confirm button for deletion.
- `CommentsPanel` reviews pending / approved comments and can approve, unapprove, or delete them.
- `SiteSettingsPanel` edits the single `site_settings` row without clobbering unsaved local edits on query refetch.

### Public article rendering

Article bodies render through `src/components/ArticleMarkdown.tsx` with `react-markdown` + `remark-gfm`. The first paragraph still gets the drop-cap treatment, while the remaining paragraphs render as normal Markdown. `src/components/Comments.tsx` is mounted below each article and submits pending comments with a hidden honeypot field.

### First-run flow

`App.tsx` wraps every route in a `SetupGuard`. While no admin exists, **any URL** renders the one-time setup screen. After the admin is created, the guard releases and the user is redirected to `/`. There is no public `/admin/setup` URL.

---

## Testing

`vitest` is wired up via `npm test` and `vitest.config.ts`, but the suite is currently empty — there are no `*.test.ts` files in the repo yet. Current discovery only includes `api/**/*.test.ts` and `api/**/*.spec.ts`.

To run a single file once tests exist:

```bash
npx vitest run api/path/to/file.test.ts
```

For now, treat `npm run check` (TypeScript) and `npm run lint` (ESLint) as the primary correctness gates, and verify behavior end-to-end against the dev server.

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

The first visit to the deployed site forces the setup overlay — create the admin account immediately after deploy to avoid leaving the door open.

### Docker

```bash
docker build -t lee-blog .
docker run --rm -p 3000:3000 \
  -v $(pwd)/blog.db:/app/blog.db \
  lee-blog
```

For a non-default DB path, mount somewhere else and pass `-e DATABASE_URL=/data/blog.db` (plus a matching volume mount).

The `Dockerfile` uses a Chinese npm mirror (`npm.mirrors.msh.team`) — change or remove that line if you build outside that network.

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
- Schema changes need `npm run db:push` against the running SQLite file.
- Existing API keys generated before the hashed-key change are invalidated on server startup; regenerate them in `/admin`.
- The `Dockerfile` defaults to a Chinese npm mirror — adjust if you build outside that network.

---

## License

Personal project. No license granted; do not redistribute without permission.
