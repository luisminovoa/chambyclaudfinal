# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Executive summary (audit of 2026-07-29 — see `docs/ESTADO-PROYECTO-v0.6.0.md`)

Chamby is ~72% of the way to MVP v1.0. The full marketplace loop works end to end
(publish → search → apply → shortlist → hire → work → complete → rate, with realtime
chat and in-app notifications). Overall quality score: **6.8/10** — strong product
design and code organisation, two serious gaps: the authorisation layer and the total
absence of automated verification.

**Read this before touching authorisation, ratings, or `profiles`:**

- 🔴 **RLS `profiles_update_own` (`0001_init.sql:225`) has no per-column `WITH CHECK`.**
  Any user can `update profiles set role='admin'` from the browser with the public anon
  key and take over the platform (it also makes admin suspension self-reversible, since
  `is_active` lives on the same row). In Postgres, an UPDATE policy without `WITH CHECK`
  reuses `USING` — owning the row means owning *every column of it*, including the one
  that grants privileges.
- 🔴 **`updateApplicationStatus` (`lib/actions/jobs.ts:261`) validates the enum but not
  the caller.** Combined with the `applications_update` policy (which permits
  `auth.uid() = worker_id`), a worker can set their own application to `aceptado` and
  self-hire — the `security definer` trigger does the rest. `hireWorker()` in
  `lib/actions/applications.ts` is the safe path; prefer it and retire the old one.
- 🔴 **`ratings_insert_participant` (`0001_init.sql:297`) validates who rates, never who
  is rated,** and `submitRating` doesn't check `rated_id` or require `status='completado'`.
  Anyone who owns a job can write ratings against any profile in the platform.
- 🟠 `profiles_select_all using (true)` exposes `phone` to unauthenticated readers —
  a Ley 29733 (Peruvian data protection) problem, not just a privacy nicety.

**Two features look implemented but are not:**

- **Identity verification does not verify.** No code path anywhere sets
  `verification_documents.status = 'verified'` — there is no admin review screen. Every
  document stays `pending` forever, so the "Verificado" badges in the UI are decorative
  and `trust_score` is capped at 55/100. Don't build on top of them.
- **`blockConversation` (`lib/actions/chat.ts:219`) is a no-op.** It writes `is_blocked`
  on the *admin's own* settings row, and nothing in the codebase ever reads `is_blocked`.

**Also worth knowing:** `is_active` is used as a "verified" signal in `lib/compatibility.ts:32`
and `ApplicantCard`, but it defaults to `true` for everyone — it's a constant, not a signal.
There is **no test runner and no CI** (no `.github/`); `npm run build` passing is the only
gate today. Migrations are applied by hand in the Supabase SQL Editor, so no one can state
with certainty which of the 11 migrations are live. `main` is 5 feature modules behind this
branch (profile, multi-role, job wizard, job search, hiring) — the repo's own "one branch
per PR" rule stopped being followed after PR #14.

Version numbers disagree across five files (`beta-config.ts` v0.6.0 · `CHANGELOG.md`
v0.7.0-beta · `README.md` v0.5.0 · `package.json` 1.0.0 · last tag v0.5.0). `beta-config.ts`
is what users actually see.

### Scores and the shortest path to a better one

| Dimension | Score | | Dimension | Score |
|---|---|---|---|---|
| Architecture | 7.5/10 | | Scalability | 6/10 |
| Code | 7.5/10 | | Documentation | 7/10 |
| Security | **4/10** | | Database | 7/10 |
| UX | 8.5/10 | | **DevOps** | **2/10** |
| Performance | 6.5/10 | | **Overall** | **6.8/10** |

Six fixes take this project from 6.8 to ~8/10, and they total about seven days: the three
critical RLS holes above, pulling `phone` out of anonymous reach, either building the
verification back-office or removing the "Verificado" badges from the UI, and **one test per
fix** so none of them silently regress. Everything else in the report is downstream of those.

Two things that are easy to get wrong when working here:

1. **Write RLS policies by asking what a row's owner may *change*, not just who may touch
   the row.** All three critical holes come from the same mistake. `WITH CHECK` is not
   optional on UPDATE.
2. **Don't trust `docs/AUDITORIA.md`'s "críticos: 0".** That audit verified RLS was *enabled*,
   not that it was correctly scoped per column — the mirror image of the P3 mistake it itself
   documents. Read policies column by column.

Per-area completion: Backend 85% · Frontend 90% · DB 80% · Security 40% · Auth 95% ·
Responsive 95% · UX 80% · Realtime 95% · Chat 95% · Notifications 55% · Admin 65% ·
Docs 70% · **DevOps 20%**.

Roadmap to v1.0 is 12 weeks in four phases (v0.7 hardening → v0.8 trust → v0.9 scale →
v1.0 payments); the first two deliberately contain **no new features**. Full reasoning,
risk matrix, and the 20 prioritised recommendations are in `docs/ESTADO-PROYECTO-v0.6.0.md`.

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
  `jobs.assigned_worker_id`, creates the conversation, and (since `0011_job_assignments.sql`)
  only flips `jobs.status` to `'en_progreso'` and auto-rejects the other applications once
  `count(aceptado) >= positions_needed` — multi-vacancy support. `count > positions_needed`
  raises, rolling the transaction back. This happens with `security definer`, so it doesn't
  depend on the caller's RLS grants for the cascading updates — which is also why the missing
  caller check in `updateApplicationStatus` is exploitable (see the executive summary).
  **The current definition lives in `0011`, not `0001` — always read the newest migration
  that redefines a function.**
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
