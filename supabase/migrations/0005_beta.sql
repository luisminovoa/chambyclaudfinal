-- ============================================================
-- CHAMBY — Beta Privada (Fase 4)
-- Tabla de reportes de errores para beta testers.
-- Sin migraciones destructivas.
-- ============================================================

create table if not exists public.bug_reports (
  id          uuid        primary key default uuid_generate_v4(),
  user_id     uuid        references public.profiles(id) on delete set null,
  route       text        not null,
  description text        not null,
  browser     text,
  os          text,
  resolution  text,
  version     text        not null default 'v0.6.0',
  created_at  timestamptz not null default now()
);

create index if not exists idx_bug_reports_created
  on public.bug_reports (created_at desc);

-- ------------------------------------------------------------
-- RLS: bug_reports
-- ------------------------------------------------------------
alter table public.bug_reports enable row level security;

-- Cualquier usuario autenticado puede insertar su propio reporte
drop policy if exists "bug_reports_insert_own" on public.bug_reports;
create policy "bug_reports_insert_own"
  on public.bug_reports for insert
  to authenticated
  with check (user_id = auth.uid() or user_id is null);

-- Solo admin puede leer todos los reportes
drop policy if exists "bug_reports_select_admin" on public.bug_reports;
create policy "bug_reports_select_admin"
  on public.bug_reports for select
  using (public.current_user_role() = 'admin');
