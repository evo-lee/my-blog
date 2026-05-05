# Lee's Blog

English · [简体中文](./README.zh-CN.md)

Personal blog by Evo Lee — articles, works, and an admin dashboard. Single Node process serves a React SPA and a tRPC API backed by SQLite.

- **Frontend:** React 19, Vite 7, react-router v7, Tailwind v3 + shadcn/ui, GSAP, Lenis
- **Backend:** Hono + tRPC v11 (superjson), Drizzle ORM + better-sqlite3, JWT (jose)
- **Build:** Vite for the client, esbuild for the API → `dist/boot.js`
- **CLI:** `scripts/publish.ts` posts Markdown articles via `X-API-Key`

---

## Quick start

```bash
# 1. Node.js 20.x or newer (project is ESM-only).
node -v

# 2. Install deps. Lockfile is npm — do not switch package managers.
npm install

# 3. Env file. Defaults work in dev; production requires real values.
cp .env.example .env

# 4. Initialize the SQLite schema (creates ./blog.db by default).
npm run db:push

# 5. Dev server — Vite + Hono on http://localhost:3000 with HMR for both
#    the SPA and api/.
npm run dev
```

First admin: open `/admin/setup` once the server is running and create the
initial user. After that, `/admin/login` and the `/admin` dashboard work.

---

## Environment

`api/lib/env.ts` validates env vars. Missing values fall back to dev defaults; in `NODE_ENV=production` they throw.

| Variable       | Required prod | Notes                                                                 |
| -------------- | ------------- | --------------------------------------------------------------------- |
| `APP_ID`       | yes           | Application ID, surfaced in JWT issuer claim.                         |
| `APP_SECRET`   | yes           | HS256 JWT secret. Dev fallback exists; **must** be set in production. |
| `DATABASE_URL` | yes           | `sqlite:./blog.db` for SQLite. Default: `./blog.db`.                  |

Note: `.env.example` currently shows a MySQL connection string for `DATABASE_URL` — the running implementation uses `better-sqlite3` and expects a SQLite path (e.g. `sqlite:./blog.db`).

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

| Path         | Purpose                                                                                                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/`       | React SPA. `App.tsx` route table, pages in `pages/`, sections in `sections/`, shadcn in `components/ui/`, providers in `providers/`, hooks in `hooks/`, i18n in `i18n/`.                                                                                                       |
| `api/`       | Hono server. `boot.ts` mounts `/api/trpc/*` and `/api/publish`. `router.ts` composes `post`, `work`, `auth` routers. `middleware.ts` defines `publicQuery` / `authedQuery` / `adminQuery` plus JWT helpers. `context.ts` resolves the user from session cookie or `x-api-key`. |
| `contracts/` | Shared types and error codes for client + server. Imported via `@contracts/*`.                                                                                                                                                                                                 |
| `db/`        | Drizzle schema (`schema.ts`), `relations.ts`, `seed.ts`, generated `migrations/`. Imported via `@db/*` or plain `db/*`.                                                                                                                                                        |
| `scripts/`   | `publish.ts` — Node CLI for publishing Markdown articles via `X-API-Key`.                                                                                                                                                                                                      |
| `public/`    | Static assets served at the root.                                                                                                                                                                                                                                              |
| `dist/`      | Build output. `dist/public/` = client, `dist/boot.js` = bundled server.                                                                                                                                                                                                        |

### Path aliases

`vite.config.ts` and `tsconfig.json` agree on:

- `@/*` → `src/*`
- `@contracts/*` → `contracts/*`
- `@db/*` and `db/*` → `db/*`

### Data

SQLite via `better-sqlite3`. Tables: `users`, `posts`, `works`, `work_details`, `work_tags`. `posts.content` and `work_details.content` are stored as JSON-stringified paragraph arrays. Body limit on the API is 50 MB (`api/boot.ts`).

### Auth

JWT (HS256) signed with `APP_SECRET`, 7-day expiry. The session lives in a `session=<jwt>` cookie. The CLI uses an alternative `x-api-key` header matched against `users.api_key`. There is no separate admin role today — every registered user is treated as admin (see TODO in `CLAUDE.md`).

---

## Testing

`vitest` is wired up via `npm test` and `vitest.config.ts`, but the suite is currently empty — there are no `*.test.ts` files in the repo yet. Add tests under `src/`, `api/`, or a top-level `__tests__/` folder; vitest will pick them up.

To run a single file once tests exist:

```bash
npx vitest run path/to/file.test.ts
```

For now, treat `npm run check` (TypeScript) and `npm run lint` (ESLint) as the primary correctness gates, and verify behavior end-to-end against the dev server.

### Manual smoke test

```bash
npm run dev
# In another shell:
curl -s http://localhost:3000/api/trpc/post.list?batch=1\&input=%7B%220%22%3A%7B%22json%22%3A%7B%22page%22%3A1%2C%22perPage%22%3A10%7D%7D%7D
```

Pages worth eyeballing: `/`, `/articles`, `/article/:slug`, `/works`, `/works/:slug`, `/about`, `/admin`, `/admin/setup`, `/admin/login`, `/admin/new`.

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

Article body must be paragraphs separated by blank lines — the endpoint splits on those and stores the result as a JSON array. Duplicate slugs return HTTP 409.

---

## Production

### Bare Node

```bash
npm run build
APP_ID=... APP_SECRET=... DATABASE_URL=sqlite:./blog.db npm start
# → http://localhost:3000
```

### Docker

```bash
docker build -t lee-blog .
docker run --rm -p 3000:3000 \
  -e APP_ID=... -e APP_SECRET=... -e DATABASE_URL=sqlite:/app/blog.db \
  -v $(pwd)/blog.db:/app/blog.db \
  lee-blog
```

The `Dockerfile` uses a Chinese npm mirror (`npm.mirrors.msh.team`) — change or remove that line if you build outside that network.

---

## Conventions

- tRPC procedures use the `superjson` transformer; `Date`, `BigInt`, `Map` serialize transparently.
- React Query is the client cache (`@tanstack/react-query` via `@trpc/react-query`); provider in `src/providers/trpc.tsx`.
- Tailwind v3 + a shadcn theme. Use `cn()` from `src/lib/utils.ts` to merge class names.
- The `/api/publish` endpoint validates that `content` is an array of paragraph strings and rejects duplicate slugs with 409.

## Known gotchas

- `tsconfig.json.bak`, `vite.config.ts.bak`, `src/App.tsx.bak`, `src/main.tsx.bak` are local backups — ignore unless asked.
- `error.log` is a runtime log file; not part of the source.
- `api/middleware.ts` and `api/context.ts` carry a hard-coded `APP_SECRET` fallback (`lee-blog-jwt-secret-change-me`) for dev. Production must set a real secret. Removing the fallback is tracked alongside auth-hardening (see `CLAUDE.md`).

---

## License

Personal project. No license granted; do not redistribute without permission.
