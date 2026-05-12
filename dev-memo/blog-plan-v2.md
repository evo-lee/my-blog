# Plan v2: 3 features for my-blog (post-review)

Revision of `/tmp/blog-plan.md` after Codex architectural review. Verdict on v1: **NEEDS REVISION**. This v2 incorporates the review findings.

Stack recap: React 19 SPA + Hono + tRPC + SQLite (better-sqlite3) + Drizzle. Single Vite process in dev, esbuild bundle in prod. DB-backed sessions (no JWT). `adminQuery` requires session cookie. i18n at `src/i18n/` (en/zh). Header already has a language switcher; the gap is *persistence + first-paint init*, not the button itself. `posts` already carries `title_zh`/`excerpt_zh`. `comments` table exists.

Note: there is already a `src/hooks/usePageTracking.ts` that calls `window.gtag(...)` / `window.umami(...)`. Any analytics loader MUST bootstrap those globals before the first route change, otherwise tracking silently no-ops.

---

## Build order (revised — was "any order")

Sequence is **not** arbitrary. Backend contracts and high-risk integrations come first:

1. **DB plumbing first** — enable SQLite FK pragma, add schema columns, generate + commit Drizzle migration. Without this, nested comments cannot rely on `ON DELETE CASCADE` and prod has no upgrade path.
2. **Comment API + tests** — `parentId` accept/validate/insert in a transaction; public list with reply visibility rules; admin list with parent chain.
3. **Comment frontend** — grouped render, reply form, PixelAvatar.
4. **i18n persistence** — lazy `useState` init (no `useEffect` flash), localStorage write, audit hardcoded public strings.
5. **Analytics** — last, because it is the highest-risk integration (third-party script execution + CSP + provider-specific bootstrap). Settings columns, validated provider/site_id, exact GA/Umami loader templates, prod-only injection, integration with existing `usePageTracking`.
6. **Docs** — `CLAUDE.md` updated with *final* decisions, not blind end-of-build dump.

---

## A. Analytics (GA / Umami) — revised

### A1. Schema (`db/schema.ts` + `db/site-defaults.ts`)

Add to `site_settings`:

- `analytics_provider` TEXT NOT NULL DEFAULT `'none'` — enum `'none' | 'google' | 'umami'`
- `analytics_site_id` TEXT NOT NULL DEFAULT `''`
- `analytics_script_url` TEXT NOT NULL DEFAULT `''` — used **only** when `provider='umami'` (self-hosted endpoint). For GA this field is ignored and must be cleared server-side on save.

Generate a Drizzle migration (do **not** rely on `db:push` for production). Commit the migration SQL alongside the schema change.

### A2. API (`api/routers/settings.ts`)

`update`:

- Zod: `analytics_provider` is `z.enum(['none','google','umami'])`.
- `analytics_site_id`: provider-specific format.
  - `google`: `/^G-[A-Z0-9]{6,}$/` (GA4 measurement ID).
  - `umami`: UUID v4 string.
  - `none`: forced to `''`.
- `analytics_script_url`: only allowed when provider is `umami`. Validate it parses as a URL, scheme is `https:`, and host matches a configurable allowlist (default: any — but config note documents the field). When provider is `none` or `google`, server forces the field to `''` on save.
- Save behavior: when provider changes, clear the now-irrelevant fields server-side so stale values cannot leak into the loader.

`get`: returns the three fields (already-public site settings shape).

### A3. UI (`src/components/admin/SiteSettingsPanel.tsx`)

New "Analytics" group:

- `<select>` for provider with three options.
- `analytics_site_id` input, helper text shows the expected format for the chosen provider.
- `analytics_script_url` input, **only rendered** when provider is `umami`.
- Inline validation matching the zod rules.

### A4. Loader — `src/components/AnalyticsLoader.tsx`

Mounted once in `src/App.tsx`. Reads `trpc.settings.get.useQuery`. Runs only when `import.meta.env.PROD`. Behavior is **provider-specific**, not a generic `<script src>` append:

**Google (GA4):**
```ts
// Idempotent: bail if window.gtag already wired for this id.
const id = settings.analytics_site_id;
if (!id || (window as any).__gaInit === id) return;
(window as any).__gaInit = id;
(window as any).dataLayer = (window as any).dataLayer || [];
function gtag(...args: unknown[]) { (window as any).dataLayer.push(args); }
(window as any).gtag = gtag;
gtag('js', new Date());
gtag('config', id, { send_page_view: false }); // route tracking owned by usePageTracking

const s = document.createElement('script');
s.async = true;
s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
document.head.appendChild(s);
```

**Umami:**
```ts
const id = settings.analytics_site_id;
const url = settings.analytics_script_url;
if (!id || !url || (window as any).__umamiInit === id) return;
(window as any).__umamiInit = id;
const s = document.createElement('script');
s.async = true;
s.defer = true;
s.src = url;
s.dataset.websiteId = id;
document.head.appendChild(s);
s.onerror = () => { delete (window as any).__umamiInit; };
```

Cleanup: on provider change between renders, remove the injected `<script>` node and clear the `__gaInit` / `__umamiInit` sentinel so a re-init can run. Do **not** attempt to fully tear down `window.gtag` (third-party state can't be fully unwound) — document this limitation.

Integration with `src/hooks/usePageTracking.ts`: keep its current `window.gtag`/`window.umami` calls. The loader is what makes those globals real; without it the hook silently no-ops, which v1 of the plan missed.

### A5. Validation / CSP / Security

- Provider-specific input validation (above) means an admin cannot inject an arbitrary `<script src=evil>` via `analytics_script_url`: GA never uses that field; Umami restricts scheme to `https:`.
- **CSP**: this app currently sets no Content-Security-Policy header (verify before shipping). If/when one is added, the loader requires `script-src` to include `https://www.googletagmanager.com` (GA) or the Umami host (Umami). Document in `CLAUDE.md`.
- XSS surface: `analytics_site_id` is rendered into a URL via `encodeURIComponent`; it is also validated by regex/UUID, so even a compromised admin cookie cannot inject HTML through this field.
- All three settings remain behind `adminQuery` (session-cookie auth), so the CLI publish API key cannot rotate analytics into something malicious.

### A6. Testing

- Vitest: settings router accepts/rejects each provider+id+url combination per spec.
- Unit-extractable helper: build the GA + Umami injection payloads as pure functions so tests don't need a DOM.
- One manual prod-preview smoke test (`npm run build && npm start`) confirming `window.gtag` exists after first render when provider is set.

---

## B. UI i18n (browser auto + persisted manual switch)

### B1. Provider (`src/i18n/I18nProvider.tsx`)

Init must avoid first-paint flash, so use **lazy `useState`** rather than `useEffect`:

```ts
const [lang, setLangState] = useState<'en'|'zh'>(() => {
  if (typeof window === 'undefined') return 'en'; // safety, even though there's no SSR
  const saved = localStorage.getItem('lang');
  if (saved === 'en' || saved === 'zh') return saved;
  return /^zh/i.test(navigator.language) ? 'zh' : 'en';
});

const setLang = (next: 'en'|'zh') => {
  localStorage.setItem('lang', next);
  setLangState(next);
};
```

Also sync `document.documentElement.lang` in a `useEffect` so screen readers / search engines see the right value. (The hardcoded `lang='en'` on `<html>` is the bug v1 didn't name.)

### B2. Switcher

A header switcher **already exists**. Only changes:

- Wire its handler to the new `setLang` (persists to localStorage).
- Visual state reflects the current `lang` from the provider, not local component state.

### B3. Strings

- Inventory hardcoded public strings before coding: at minimum, audit `src/sections/Header.tsx` and `src/pages/NotFound.tsx` (review noted these still have hardcoded labels).
- Extend `src/i18n/translations.ts` with: `Reply`, language switcher labels, comment form pending/success/error copy, and whatever the inventory turns up.
- Admin dashboard stays English (single-admin blog).

### B4. Testing

- Vitest: provider lazy init returns `'zh'` when `navigator.language='zh-CN'` and no localStorage; returns saved value when set; ignores garbage values.
- Snapshot a public page's first render to confirm no English flash before useEffect runs.

---

## C. Nested comments (1 level) + pixel avatar

### C1. SQLite FK enforcement (prerequisite, was missing in v1)

`api/queries/connection.ts` must execute `PRAGMA foreign_keys = ON` on the better-sqlite3 connection at construction. Without this, `ON DELETE CASCADE` is silently inert and FK violations don't surface — the reply-race handling depends on real FK errors being thrown.

### C2. Schema (`db/schema.ts`)

`comments` adds:

- `parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE` (nullable).

App-layer rule: `parent.parent_id` must be `NULL` (so depth is capped at 1). Enforced in `submit`, inside a transaction (see C3).

Generate a Drizzle migration and commit it. Production runs `npm run db:migrate`; `db:push` is dev-only per `CLAUDE.md`.

### C3. API (`api/routers/comment.ts`)

`submit`:

- Input adds optional `parentId: number`.
- Open a transaction:
  1. `SELECT id, post_id, parent_id, approved FROM comments WHERE id = ?` for the parent.
  2. Reject if missing, different `post_id`, or `parent_id IS NOT NULL` (depth cap).
  3. Insert reply with `approved=false`, `parent_id=parentId`.
- On `SQLITE_CONSTRAINT_FOREIGNKEY` (race: admin deleted parent mid-transaction), return tRPC `CONFLICT` with a clear user-facing message; do not 500.

`listForPost` (public): returns top-level approved comments + their **approved** replies. Replies whose parent is unapproved or deleted are excluded from public view (orphans don't render). Client groups by `parent_id`.

Ordering rule (was undefined in v1):
- Top-level: `created_at DESC` (newest first, matches current behavior).
- Replies under a parent: `created_at ASC` (chronological under each thread — easier to read).

`adminList`: returns `parent_id` so the moderation UI can show "Reply to: …". Admin sees pending replies regardless of parent state.

Admin moderation semantics (was underspecified in v1):
- **Delete parent**: cascade removes replies (FK).
- **Unapprove parent**: replies stay in DB but become invisible publicly (because `listForPost` requires parent approved).
- **Approve reply to unapproved parent**: allowed in admin, but reply remains publicly hidden until parent is also approved.

### C4. Frontend (`src/components/Comments.tsx`)

- Group comments by `parent_id` client-side.
- Each top-level comment gets a "Reply" button → toggles a single inline form below that comment. Only one reply form open at a time (clicking "Reply" on another closes the previous one) — keeps state simple.
- Reply form mirrors the main form: name (required), email (optional, never displayed), content, honeypot, submit. Pending/success/error states all reuse the same components as the top-level form.
- Replies render indented (one step), with the same approval-pending message after submit.

### C5. PixelAvatar (`src/components/PixelAvatar.tsx`)

Seed strategy (resolves v1's open concern): **name only**.

- Server returns only `authorName` publicly (already the case).
- Client computes `seed = authorName.trim().toLowerCase()`.
- Email is never sent to the client, so it cannot be used as seed — v1's `name + email` was not implementable on the client side anyway.
- FNV-1a hash → 8×8 left-right symmetric grid → HSL palette → inline SVG. Zero deps.
- Collision risk on common names is acceptable for a personal blog comment section; if it ever becomes a problem, switch to a server-supplied opaque hash in `listForPost`.

### C6. Testing

- Vitest API tests:
  - submit with valid parentId works.
  - submit with parentId that has its own parent_id is rejected (depth cap).
  - submit with parentId from a different post is rejected.
  - simulated FK race (delete parent between select and insert) returns `CONFLICT`, not 500.
  - listForPost hides replies under unapproved parents.
- Vitest unit: PixelAvatar deterministic — same name → same SVG.

---

## D. Docs

Update `CLAUDE.md` after each feature lands (not all at the end):

- Comments section: nested 1-level rule, ordering, moderation semantics for unapprove/delete + cascade, FK pragma now enabled.
- `site_settings` section: analytics fields, provider-specific validation rules, mention CSP requirement when a CSP is introduced.
- i18n section: lazy-init from localStorage / `navigator.language`, `<html lang>` sync, switcher persistence, public-strings policy.
- Production-deploy note: `npm run db:migrate` (not `db:push`) for schema changes.

---

## Resolved concerns from v1

| Concern | Resolution |
|---|---|
| XSS via `analytics_script_url` | Field only used for Umami; scheme forced to `https:`, validated as URL; GA never uses it. Site ID is regex/UUID-validated and URL-encoded. CSP guidance documented. |
| Email seed leak | Resolved: seed is `name` only, computed client-side. Email is never returned by `listForPost`. |
| Reply to deleted parent (race) | Enable SQLite FK pragma; wrap submit in transaction; map `SQLITE_CONSTRAINT_FOREIGNKEY` to tRPC `CONFLICT`. |
| `navigator.language` on hydration flash | Lazy `useState` initializer reads localStorage / `navigator.language` synchronously — no useEffect-induced flash. |
| Migration vs `db:push` | Dev uses `db:push`; **production** uses a generated, committed Drizzle migration applied with `db:migrate`. Plan adds two migrations (analytics columns, comments.parent_id). |
| Build order | Now explicit: DB plumbing → comments API+tests → comments UI → i18n → analytics (highest-risk last) → docs. |
| Completeness | Added FK pragma, migration story, GA bootstrap, Umami URL allow rules, reply moderation semantics, ordering rules, single-open-reply-form UX, tests per feature. |

## Overall verdict on v2

Buildable as written. Highest residual risk is the GA loader interaction with the existing `usePageTracking` hook — covered by the prod-preview smoke test. Second is whatever currently-undocumented CSP exists in the deploy environment — verify before turning analytics on.
