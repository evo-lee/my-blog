# CLAUDE.md

Personal blog (Lee's Blog). Full-stack TypeScript app — React SPA + Hono/tRPC API + SQLite, served as one Node process in production.

## Prerequisites

First-run setup before any `npm` command:

1. **Node.js**: 20.x or newer (ESM-only project, `"type": "module"`).
2. **Install deps**: `npm install` (uses `package-lock.json`; do not switch to pnpm/yarn).
3. **Env file**: `cp .env.example .env`, then set `APP_ID`, `APP_SECRET`, `DATABASE_URL`. In dev, missing values fall back to defaults; in production they throw.
4. **DB init**: `npm run db:push` creates SQLite tables at `DATABASE_URL` path (default `./blog.db`).
5. **Optional CLI auth**: for `scripts/publish.ts`, write `~/.leeblog.json` with `{ "apiKey": "..." }` matching a row in `users.api_key`, or set `LEEBLOG_API_KEY`.

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

Run a single test: `npx vitest run path/to/file.test.ts`.

## Architecture

Single Vite process serves both the React client and the Hono API in dev (via `@hono/vite-dev-server` with `entry: "api/boot.ts"`). In production `npm start` runs the bundled `dist/boot.js` which mounts the SPA from `dist/public` and the API on `/api/*`.

### Layout

- `src/` — React 19 SPA. `App.tsx` is the route table (react-router v7). Pages in `src/pages/`, layout sections in `src/sections/`, shadcn primitives in `src/components/ui/`, providers in `src/providers/`, hooks in `src/hooks/`, i18n in `src/i18n/`.
- `api/` — Hono server. `boot.ts` mounts `/api/trpc/*` (tRPC fetch adapter) and `/api/publish` (REST endpoint for the CLI). `router.ts` composes feature routers from `routers/` (`post`, `work`, `auth`). `middleware.ts` defines `publicQuery` / `authedQuery` / `adminQuery` procedures and JWT helpers. `context.ts` builds the per-request `TrpcContext` (resolves `user` from session cookie or `x-api-key` header). `queries/connection.ts` is the singleton Drizzle client. `lib/env.ts` validates env vars (throws in production if missing).
- `contracts/` — shared types and error codes consumed by both client and api. Imported via `@contracts/*`.
- `db/` — Drizzle schema (`schema.ts`), relations (`relations.ts`), seed (`seed.ts`), generated migrations (`migrations/`). Imported via `@db/*` (also aliased as plain `db`).
- `scripts/publish.ts` — Node CLI that POSTs Markdown articles (with frontmatter) to `/api/publish` using an `X-API-Key`. Reads `~/.leeblog.json` or `LEEBLOG_API_KEY`.

### Path aliases (`vite.config.ts` + `tsconfig.json`)

- `@/*` → `src/*`
- `@contracts/*` → `contracts/*`
- `@db/*` and `db/*` → `db/*`

### Data

SQLite via `better-sqlite3`. DB file path comes from `DATABASE_URL` (e.g. `sqlite:./blog.db`), default `./blog.db`. Tables: `users`, `posts`, `works`, `work_details`, `work_tags`. `posts.content` and `work_details.content` are stored as JSON-stringified paragraph arrays.

### Auth

JWT (HS256) signed with `APP_SECRET`, 7-day expiry. Session lives in a `session=<jwt>` cookie. The CLI uses an alternative `x-api-key` header matched against `users.api_key`. `authedQuery` and `adminQuery` both require `ctx.user`; there is no separate admin role check today (every registered user is treated as admin).

> **TODO (auth-hardening)**: split `adminQuery` from `authedQuery` — add `users.role` column + role check in `api/middleware.ts`. Required before opening public registration.

### Env vars (required in production)

`APP_ID`, `APP_SECRET`, `DATABASE_URL`. Loaded via `dotenv/config`; missing values throw only when `NODE_ENV=production`.

## Conventions

- tRPC procedures use `superjson` transformer — Date/BigInt/Map serialize transparently.
- React Query is the client cache (`@tanstack/react-query` via `@trpc/react-query`); provider in `src/providers/trpc.tsx`.
- Styling: Tailwind v3 + shadcn theme. Use `cn()` from `src/lib/utils.ts` to merge class names.
- Body limit on the API is 50 MB (set in `api/boot.ts`).
- The `/api/publish` REST endpoint validates that `content` is an array of paragraph strings and rejects duplicate slugs with 409.

## Things to know

- `tsconfig.json.bak`, `vite.config.ts.bak`, `src/App.tsx.bak`, `src/main.tsx.bak` are local backups — ignore unless asked.
- `error.log` is a runtime log file; not part of the source.
- Default `APP_SECRET` fallback (`lee-blog-jwt-secret-change-me`) exists in `api/middleware.ts` and `api/context.ts` for dev. Production must set a real secret or env validation in `lib/env.ts` will throw.
  - **TODO (pre-public-deploy)**: remove the hard-coded fallback strings from `api/middleware.ts` and `api/context.ts`; let `lib/env.ts` be the single source. Tracked alongside auth-hardening above.
