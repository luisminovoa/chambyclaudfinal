-- ============================================================
-- CHAMBY — Auditoría de moderación (Fase 1, parte 2)
--
-- Diseño completo en docs/user-reporting-moderation-design.md (§3.4,
-- §10). Requiere 0019_user_reports_moderation.sql aplicada primero
-- (moderation_actions.report_id referencia public.reports).
--
-- Responde, independientemente del estado actual de un reporte o de
-- que siga existiendo: "¿por qué fue suspendido este usuario?".
-- Append-only por diseño — sin policy UPDATE ni DELETE en absoluto,
-- mismo patrón que verification_document_reviews (0016) / job_state_
-- history (0002).
--
-- Los triggers `notify_report_status_changed()` / `notify_moderation_
-- action()` descritos en el documento de diseño (§4, §13) que
-- insertarían en `notifications` quedan explícitamente FUERA de esta
-- migración — pertenecen a la Fase 7 (Notificaciones) del checklist,
-- no a la Fase 1 (Seguridad + Base de datos). En esta fase, el registro
-- de auditoría lo escribe directamente updateReportStatus()
-- (src/lib/actions/admin-reports.ts) al cambiar el estado de un
-- reporte — sin trigger, sin efecto secundario de notificación.
-- ============================================================

do $$ begin
  create type public.moderation_action_type as enum (
    'status_changed',
    'note_added',
    'warning_issued',
    'temporary_suspension',
    'permanent_block',
    'account_deactivated',
    'no_action'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.moderation_actions (
  id             uuid primary key default gen_random_uuid(),

  -- on delete set null (no cascade): el historial debe sobrevivir a
  -- que el reporte original se elimine — la pregunta "¿por qué fue
  -- suspendido?" no puede depender de que ese reporte todavía exista.
  report_id      uuid references public.reports(id) on delete set null,

  admin_id       uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete cascade,
  action_type    public.moderation_action_type not null,
  reason         text,
  metadata       jsonb not null default '{}',
  created_at     timestamptz not null default now()
);

create index if not exists idx_moderation_actions_target
  on public.moderation_actions (target_user_id, created_at desc);
create index if not exists idx_moderation_actions_report
  on public.moderation_actions (report_id);

alter table public.moderation_actions enable row level security;

-- SELECT: admin-only. Ni el reportante ni el usuario denunciado tienen
-- ninguna policy que los alcance.
drop policy if exists "moderation_actions_select_admin" on public.moderation_actions;
create policy "moderation_actions_select_admin"
  on public.moderation_actions for select
  using (public.current_user_role() = 'admin');

-- INSERT: admin-only, y además el propio admin no puede insertar una
-- fila atribuida a otro admin (admin_id = auth.uid() forzado por el
-- WITH CHECK) — evita que una Server Action con un bug (o un cliente
-- directo) falsifique quién tomó la acción.
drop policy if exists "moderation_actions_insert_admin" on public.moderation_actions;
create policy "moderation_actions_insert_admin"
  on public.moderation_actions for insert
  with check (public.current_user_role() = 'admin' and admin_id = auth.uid());

-- Sin policy UPDATE ni DELETE para nadie, admin incluido — append-only
-- real. Si en el futuro se necesita corregir una fila mal registrada,
-- la corrección correcta es insertar una fila nueva que la explique,
-- no editar/borrar la original.
