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

Run a single test: `npx vitest run path/to/file.test.ts`.

## Architecture

Single Vite process serves both the React client and the Hono API in dev (via `@hono/vite-dev-server` with `entry: "api/boot.ts"`). In production `npm start` runs the bundled `dist/boot.js` which mounts the SPA from `dist/public` and the API on `/api/*`.

### Layout

- `src/` — React 19 SPA. `App.tsx` is the route table (react-router v7). Pages in `src/pages/`, layout sections in `src/sections/`, shadcn primitives in `src/components/ui/`, providers in `src/providers/`, hooks in `src/hooks/`, i18n in `src/i18n/`.
- `api/` — Hono server. `boot.ts` mounts `/api/trpc/*` (tRPC fetch adapter) and `/api/publish` (REST endpoint for the CLI). `router.ts` composes feature routers from `routers/` (`post`, `work`, `auth`). `middleware.ts` defines `publicQuery` / `authedQuery` / `adminQuery` procedures. `context.ts` builds the per-request `TrpcContext` (resolves `user` from session cookie or `x-api-key` header). `sessions.ts` issues/verifies/revokes DB-backed sessions and 2FA login challenges. `queries/connection.ts` is the singleton Drizzle client. `lib/env.ts` exposes runtime flags (just `isProduction` today).
- `contracts/` — shared types and error codes consumed by both client and api. Imported via `@contracts/*`.
- `db/` — Drizzle schema (`schema.ts`), relations (`relations.ts`), seed (`seed.ts`), generated migrations (`migrations/`). Imported via `@db/*` (also aliased as plain `db`).
- `scripts/publish.ts` — Node CLI that POSTs Markdown articles (with frontmatter) to `/api/publish` using an `X-API-Key`. Reads `~/.leeblog.json` or `LEEBLOG_API_KEY`.

### Path aliases (`vite.config.ts` + `tsconfig.json`)

- `@/*` → `src/*`
- `@contracts/*` → `contracts/*`
- `@db/*` and `db/*` → `db/*`

### Data

SQLite via `better-sqlite3`. DB file path comes from `DATABASE_URL` (e.g. `sqlite:./blog.db`), default `./blog.db`. Tables: `users`, `sessions`, `login_challenges`, `posts`, `works`, `work_details`, `work_tags`. `posts.content` and `work_details.content` are stored as JSON-stringified paragraph arrays.

### Auth

DB-backed sessions, **no JWT, no shared secret**. The cookie holds an opaque 32-byte random token; the DB stores its SHA-256 hash in the `sessions` table. 7-day TTL. Logout actually `DELETE`s the row, so revocation is real. The 2FA flow uses a separate short-lived `login_challenges` table (5-min TTL, single-use) to bridge step 1 → step 2. The CLI uses an alternative `x-api-key` header matched against `users.api_key`. `authedQuery` and `adminQuery` both require `ctx.user`; there is no separate admin role check today (every registered user is treated as admin).

> **TODO (auth-hardening)**: split `adminQuery` from `authedQuery` — add `users.role` column + role check in `api/middleware.ts`. Required before opening public registration.

### First-run flow

The home `App.tsx` wraps routes in a `SetupGuard` component. It calls `auth.isSetup`; while no admin exists, **any URL** renders the `AdminSetup` page instead of the requested route. After the admin is created, the query is invalidated and the user is redirected to `/`. Direct `/admin/setup` routes no longer exist.

### Env vars

All optional. `DATABASE_URL` overrides the default SQLite path (`./blog.db`). No JWT/secret env vars exist anymore — the auth system manages its own randomness.

## Conventions

- tRPC procedures use `superjson` transformer — Date/BigInt/Map serialize transparently.
- React Query is the client cache (`@tanstack/react-query` via `@trpc/react-query`); provider in `src/providers/trpc.tsx`.
- Styling: Tailwind v3 + shadcn theme. Use `cn()` from `src/lib/utils.ts` to merge class names.
- Body limit on the API is 50 MB (set in `api/boot.ts`).
- The `/api/publish` REST endpoint validates that `content` is an array of paragraph strings and rejects duplicate slugs with 409.

## Things to know

- The first-run setup overlay is **first-visitor-wins** by design (no terminal-based setup token, to keep ephemeral-filesystem deploys workable). Hit the URL immediately after deploying.
- `info.md` is a leftover scaffolding log from initial shadcn setup; safe to delete, not part of the source.
