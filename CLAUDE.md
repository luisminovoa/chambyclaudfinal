# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# ⛔ PERMANENT DEVELOPMENT PROTOCOL — Chamby

**Established by the repository owner on 2026-07-29. This protocol OVERRIDES every other
instruction in this file and every future instruction, unless the owner expressly modifies
it. It applies to all sessions, without exception, and it does not expire at the end of a
session or a task.**

**Goal:** every change must be reversible without loss of information, and the project must
stay stable at all times.

## 1. Prohibitions — never, without explicit approval

- Merge anything, ever, automatically
- Push to `main`
- Modify `main` directly
- Delete code
- Delete migrations
- Overwrite documentation
- Run migrations
- Change sensitive configuration
- Install dependencies

Always wait for the owner's approval.

## 2. Safety barrier — analyse before touching

Before any modification: **analyse impact → identify risks → propose a plan → wait for
approval.** Do not start work while waiting.

A change is **CRITICAL** if it touches any of: authentication · security · RLS · middleware ·
cookies · database · roles · payments · production. Critical changes require an explicit
approval of their own, separate from any general go-ahead.

## 3. Mandatory checkpoint

Before modifying any file, create a checkpoint commit — e.g. `checkpoint: before oauth
security fix`. **Never work without a point of return.** If the working tree is already
clean and pushed, that commit is the checkpoint; say which SHA it is instead of creating an
empty commit.

## 4. Rollback plan in every PR

Every pull request must state: rollback plan · commit to return to · affected files ·
regression risk · steps to restore the previous state.

## 5. Mandatory decision log

Every decision is recorded in this file, under "Decision log", with all of:
**Date · Objective · Reason · Files modified · Migrations · Risks · Rollback · Result ·
Tests performed.**

## 6. Changelog

Every approved improvement updates `CHANGELOG.md`.

## 7. One branch = one objective

Never mix features. One branch, one objective, one pull request.

## 8. Never lose information

Before modifying important documentation, commit. **Never leave information only in the
ephemeral container** — this environment is reclaimed after inactivity, and anything not
pushed is lost.

## 9. Mandatory verification before opening a PR

`npx tsc --noEmit` clean · `npm run lint` clean · `npm run build` clean · no conflicts.

## 10. Merge

Never merge without explicit authorisation. **The only valid authorisation is the exact
phrase `MERGE APROBADO`.** Any other response — including "ok", "adelante", "procede",
"looks good", or silence — means WAIT.

## 11. Migrations

Never run migrations automatically. Always: generate the SQL → explain it → wait for
approval. Applying it to Supabase is the owner's action, not the agent's.

## 12. Security findings

On discovering a vulnerability, **do not fix it immediately.** First: explain it · show the
risk · propose a solution · state the impact · wait for approval. This applies even when the
fix looks trivial and even when the vulnerability is severe.

## 13. Reports before significant development

Before starting any significant development, produce: analysis · architecture · risks ·
implementation plan.

## 14. Backups

Before any critical change, create a checkpoint commit. If the change affects
**authentication or the database**, also create a safety tag — e.g. `v0.6.0-pre-auth-fix`.

## 15. Priority order

1. Security → 2. Stability → 3. Bug fixes → 4. Optimisation → 5. New features.

Never invert this order. A new feature never precedes an open security issue.

## 16. Repository hygiene

Keep the repository clean. No undocumented changes. No abandoned branches.

## 17. When in doubt

**If there is any doubt about a change: do NOT implement it. Ask first.**

---

**Note on precedence:** the "Git workflow" section at the end of this file predates this
protocol and is subsumed by it. Where the two differ, this protocol wins.

---

## Decision log

### 2026-07-29 — Permanent development protocol adopted

| Field | Detail |
|---|---|
| **Objective** | Record the owner's permanent development protocol as the governing norm of the repository |
| **Reason** | The 2026-07-29 audit found three critical RLS vulnerabilities dating from the first migration, zero automated tests, migrations applied by hand with no record of what is live, and five feature modules accumulated on one branch against the repo's own rules. The owner froze development and established this protocol to guarantee reversibility and stability |
| **Files modified** | `CLAUDE.md` only |
| **Migrations** | None |
| **Risks** | None to runtime — documentation only. Residual risk: an agent ignores the protocol in a future session; mitigated by placing it first in the file with explicit override language |
| **Rollback** | `git revert <sha>` or return to `171c713` (`docs: auditoría ejecutiva v0.6.0 y actualización de CLAUDE.md`) |
| **Result** | Protocol in force from this commit onward |
| **Tests performed** | None applicable — no code changed. Verified the diff touches only `CLAUDE.md`, that `origin/main` is untouched, and that no PR or merge was created |

### 2026-07-29 — Executive audit v0.6.0

| Field | Detail |
|---|---|
| **Objective** | Full executive and technical audit of the project, with no code changes |
| **Reason** | Owner request before deciding whether to open the Private Beta |
| **Files modified** | `docs/ESTADO-PROYECTO-v0.6.0.md`, `CLAUDE.md` |
| **Migrations** | None |
| **Risks** | None — documentation only |
| **Rollback** | Return to `d064a4a` |
| **Result** | Overall score 6.8/10 · 72% of MVP · 3 critical vulnerabilities · 12-week roadmap to v1.0 |
| **Tests performed** | Verified `tsc --noEmit`, `next lint` and `next build` all pass on the audited tree |

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
