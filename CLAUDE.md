# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # dev server (localhost:3000)
npm run build    # production build — must pass before any PR
npm run lint     # next lint (next/core-web-vitals via .eslintrc.json)
npx tsc --noEmit # strict type-check (tsconfig strict: true) — no test runner in this repo
```

There is no `.env.example`; required env vars (see `src/lib/supabase/*.ts`) are:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
(server-only, used by `createAdminClient()` — never expose to the client).

To run a production build without a real Supabase project (e.g. for local UI/responsive
verification), dummy values work since no page does build-time data fetching that requires
a live connection to succeed:
```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy-key npx next start -p 3999
```

## Architecture

Next.js 14 App Router + Supabase (Postgres, Auth, RLS). Chamby is a Peruvian marketplace
connecting `worker`/`employer` roles for temporary jobs, with an `admin` role for moderation.

### The database (not just the ORM) owns state transitions

`supabase/migrations/0001_init.sql` is the source of truth for business logic that looks
missing if you only read `src/lib/actions/*.ts`. Notably:

- `handle_application_accepted()` — an `AFTER UPDATE` trigger on `job_applications` — fires
  whenever a Server Action sets `status = 'aceptado'`. It atomically sets
  `jobs.assigned_worker_id`, flips `jobs.status` to `'en_progreso'`, and auto-rejects the
  job's other pending applications. This happens with `security definer`, so it doesn't
  depend on the caller's RLS grants for the cascading updates.
- `handle_new_user()` — creates a `profiles` row from `auth.users` metadata on signup.
- RLS is enabled on every table; policies gate by `auth.uid()` ownership or
  `current_user_role() = 'admin'`. **Before assuming a business rule is unimplemented,
  grep this migration file for triggers/functions — don't infer only from TS code.**
  (`docs/AUDITORIA.md` and `docs/FLUJO-CONTRATACION.md` document a case where this
  assumption was wrong and had to be corrected.)

### Data flow

- `src/lib/supabase/server.ts` — `createClient()` for Server Components/Actions (cookie-based
  session); `createAdminClient()` for admin-only service-role operations.
- `src/lib/supabase/client.ts` — browser client (OAuth sign-in only).
- `src/lib/get-current-profile.ts` — `getCurrentUserAndProfile()`, wrapped in React `cache()`
  so Navbar + BottomNav + a page all calling it in one request only hits Supabase once.
- `src/middleware.ts` + `src/lib/supabase/middleware.ts` — refreshes the session and gates
  `/dashboard`, `/jobs/new`, `/admin` server-side, redirecting to `/login?next=<path>`.
- Mutations are Server Actions in `src/lib/actions/{auth,jobs,ratings,admin}.ts`, validated
  with Zod (or manual enum checks for status transitions — RLS restricts *who*, the action
  must still restrict *what value*). `admin.ts` actions all funnel through `assertAdmin()`.
- `src/lib/types.ts` documents why the hand-written `Database` type needs `Relationships: []`
  on every table/view — supabase-js silently collapses mutations to `never` without it.

### Perfil Profesional del Trabajador (`/dashboard/worker/profile`)

- Five tables added in `0010`-`0013`: `profile_photos`, `verification_documents`,
  `profile_stats` (cache, see below), `worker_profile_details` (1:1 extended fields —
  deliberately does **not** split `profiles.full_name` into first/last name; that field is
  read everywhere in the app), `worker_experience` (1:N). None of them alter `profiles`.
- **All Storage access goes through `createAdminClient()` + signed URLs** (`src/lib/actions/
  profile.ts`) — the client never calls `supabase.storage` directly with its own session.
  This means the `storage.objects` RLS policies in `0010` are a secondary/defense-in-depth
  layer, not the active gate; the real boundary is `getAuth()` + server-constructed paths
  (`${user.id}/...`) inside the Server Actions. `saveProfilePhoto`/`saveVerificationDocument`
  validate that a client-supplied `storagePath` starts with the caller's own `user.id` before
  trusting it — without that check, a client could register a DB row pointing at another
  user's file and then delete it via the admin-privileged delete call (see `0013`, fixed after
  being caught in a pre-merge audit, not by the original design).
- `profile_photos` and `profile_stats` use **column-level `REVOKE`/`GRANT`** (not just RLS
  `WITH CHECK`) as the write boundary — `0013_harden_profile_module_rls.sql`. `authenticated`
  can only `UPDATE (is_primary, display_order)` on `profile_photos` (never `storage_path`/
  `public_url`/`profile_id`), and has no `INSERT`/`UPDATE` at all on `profile_stats` — only
  `computeAndSaveProfileStats()` (admin client) may write trust badges/percentage. Same
  pattern as the RLS Security Sprint (`0007`-`0009`): when a column's value must be trusted
  (a verified badge, a storage pointer used in a privileged delete), lock the column at the
  grant level rather than relying on `WITH CHECK` alone.
- `getProfileCompletionItems()` (`src/lib/profile-completion.ts`) is a **display-only**
  mirror of the scoring in `computeAndSaveProfileStats()` — used by `VerificationTab` and
  `DashboardProfileCard` so the breakdown UI isn't duplicated between them, but it does not
  compute or persist the authoritative score. If you change point weights, change both.
- Skills autocomplete (`SkillsSelector`) suggests from `src/lib/skills-catalog.ts`, a plain
  exported array (not a table) — same pattern as `CATEGORIES` in `InfoTab.tsx`. Free-text
  entry still works; `profiles.skills` is unchanged. Migrating to a `skill_catalog` table is
  deferred until there's an admin UI to manage it.

### Auth redirect-after-login

`login`/`register` Server Actions accept a `next` form field and redirect there via
`safeNextPath()` (`src/lib/actions/auth.ts`) instead of hardcoding `/dashboard`. That
validator only accepts single-leading-slash internal paths — reuse it rather than
redirecting to a raw `next` value, to avoid open redirects.

### Design system

- Brand tokens live in `tailwind.config.ts` (`primary`/`success`/`warning`/`danger`/`sun`
  scales, `bg-brand-gradient`, `shadow-glow*`) and `globals.css` (`.btn-*`, `.input`, `.card`,
  `.badge`, `.skeleton` component classes — prefer these over ad-hoc utility strings).
- `src/components/ui/` holds cross-page primitives (`Button` variants via CVA pattern is
  intentionally *not* here — the `.btn-*` classes in `globals.css` are the actual button
  system; a stray `ui/Button.tsx` was removed as dead code in the audit).
- `src/components/brand/` is Chamby's mascot system: `AntIcon` (silhouette, `currentColor`),
  `LogoHorizontal`/`LogoCompacto`/`LogoLink`, `AntLoader` (walking-ant loading state, not a
  spinner), `AntIllustration` (poses: `wave`/`search`/`briefcase`/`lost`/`celebrate`/`mail`
  for empty states, 404, and success states). Use `EmptyState`'s `pose` prop (falls back to
  `icon` for cases with no matching pose) rather than inventing new illustrations ad hoc.
- `Reveal` (`components/ui/Reveal.tsx`) is the standard scroll-in animation wrapper for
  server-rendered content; respects `useReducedMotion`.

### SEO/PWA infra

`src/app/{robots,sitemap,manifest}.ts` are the Next.js file-convention metadata routes
(not static files). `sitemap.ts` queries open jobs from Supabase at request time — it has a
try/catch fallback to static routes only if the query fails, so a DB outage can't 500 the
sitemap. `public/sw.js` is a network-first service worker registered by
`components/RegisterSW.tsx` (production only) that only ever serves `/offline` as a fallback,
never stale cached pages.

## Git workflow

One branch per PR, one clear objective per PR, `main` always kept stable/deployable — every
PR gets a Netlify deploy preview (two projects: `chambyclaudfinal` and `chamby-app`) that
must go green before merge. Business-logic or UX changes (not pure bugfixes/hardening) get
proposed as a design doc in `docs/` and approved before implementation, not bundled silently
into an unrelated PR.
