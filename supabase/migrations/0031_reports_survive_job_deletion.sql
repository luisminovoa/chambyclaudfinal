-- ============================================================
-- CHAMBY — Los reportes de oferta sobreviven al borrado del job
-- (corrección hacia adelante, no se modifica 0019)
--
-- Hallazgo (auditoría de migraciones 0019-0030): reports.reported_job_id
-- (0019) usa `references public.jobs(id) on delete cascade`. deleteJob()
-- (src/lib/actions/jobs.ts) no tiene ninguna lógica propia de
-- autorización más allá de RLS — cualquier empleador dueño del job puede
-- borrarlo sin restricción vía la policy jobs_delete_owner_or_admin
-- (0001_init.sql), incluso si ese job tiene un reporte activo en su
-- contra. Con ON DELETE CASCADE, ese borrado arrastra silenciosamente:
--   - la fila de `reports` (reason, description, status, reviewed_by,
--     admin_notes, todo el historial de moderación de ese reporte),
--   - todo `report_evidence` asociado (report_evidence.report_id
--     references reports(id) on delete cascade, 0019).
-- Es decir: el propio empleador reportado puede borrar la evidencia en
-- su contra simplemente borrando el job. Esto es un vector de evasión de
-- moderación, no solo una pérdida de datos accidental.
--
-- moderation_actions no tiene este problema — moderation_actions.report_id
-- ya usa `on delete set null` (0020) precisamente para sobrevivir al
-- borrado de un reporte. El problema es específico de la cadena
-- jobs → reports vía reported_job_id.
--
-- FIX (hacia adelante, tres cambios coordinados — cambiar solo la FK no
-- alcanza, porque el UPDATE interno que dispara ON DELETE SET NULL debe
-- seguir satisfaciendo el CHECK de la tabla):
--
--   1. reported_job_id pasa a ON DELETE SET NULL: al borrarse el job,
--      Postgres pone reported_job_id = null en vez de borrar la fila.
--
--   2. reports_target_matches_type se relaja SOLO para permitir que un
--      reporte con target_type='job' y reported_job_id ya null exista
--      como fila histórica (que es exactamente el estado que el propio
--      ON DELETE SET NULL produce). target_type='user' no cambia en
--      absoluto: sigue exigiendo reported_user_id not null y
--      reported_job_id null, igual que en 0019.
--
--   3. Como el CHECK relajado por sí solo ya NO puede impedir que un
--      cliente cree directamente un reporte target_type='job' con
--      reported_job_id=null desde cero, esa protección se mueve a la
--      policy RLS reports_insert_own (INSERT es el único camino de
--      creación de un reporte nuevo — nunca vía UPDATE, ver abajo):
--      ahora exige explícitamente reported_job_id is not null cuando
--      target_type='job' (y reported_user_id is not null cuando
--      target_type='user', ya cubierto por el CHECK pero declarado aquí
--      también para que la policy sea autocontenida). El estado
--      histórico con reported_job_id=null solo puede originarse por el
--      ON DELETE SET NULL de Postgres, nunca por un INSERT de cliente.
--
-- Por qué NO hace falta un cuarto cambio para impedir que un cliente
-- MODIFIQUE target_type/reported_job_id/reported_user_id de un reporte
-- ya existente para fabricar ese mismo estado histórico por otra vía:
-- 0019 ya revoca UPDATE completo sobre public.reports para `authenticated`
-- y solo lo re-otorga columna por columna sobre (status, reviewed_by,
-- reviewed_at, admin_notes, updated_at):
--
--   revoke update on public.reports from authenticated;
--   grant update (status, reviewed_by, reviewed_at, admin_notes, updated_at)
--     on public.reports to authenticated;
--
-- target_type/reported_job_id/reported_user_id nunca estuvieron en esa
-- lista — ni un usuario normal ni un admin autenticado vía PostgREST
-- pueden tocar esas columnas por UPDATE, sin importar qué diga
-- reports_update_admin a nivel de RLS (el candado de columna actúa antes
-- y de forma independiente de RLS, mismo patrón que profile_photos/
-- profile_stats/user_roles). Esta migración no toca ese GRANT/REVOKE
-- porque ya es suficiente y sigue siéndolo tras el cambio del CHECK. El
-- único camino que puede dejar reported_job_id en null sobre una fila que
-- ya tenía un job asignado es la acción referencial ON DELETE SET NULL
-- que dispara Postgres al borrarse la fila de `jobs` — una operación
-- interna del motor, no un UPDATE emitido por un rol con privilegios
-- normales, y por eso no está sujeta al GRANT/REVOKE de columnas.
--
-- report_evidence (0019, report_id references reports(id) on delete
-- cascade) y moderation_actions (0020, report_id references reports(id)
-- on delete set null) no se tocan: ninguna de las dos depende de
-- reported_job_id, y ambas ya se comportan como se pide — la evidencia
-- solo desaparece si el REPORTE se borra (nunca ocurre, reports no tiene
-- policy DELETE para nadie), y moderation_actions nunca referenció
-- reported_job_id en absoluto.
--
-- reports_no_duplicate_active_job (0025) tampoco requiere cambios: es un
-- índice único PARCIAL filtrado por `reported_job_id is not null` — en
-- cuanto una fila pasa a reported_job_id=null por el ON DELETE SET NULL,
-- automáticamente deja de estar indexada por ese índice y no puede violar
-- ninguna unicidad frente a otras filas históricas del mismo reportante.
--
-- Seguridad de aplicación sobre datos existentes: el paso 1 localiza el
-- nombre real de la FK dinámicamente (information_schema) en vez de
-- asumir el nombre por defecto de Postgres, así que es segura de
-- reaplicar y no depende de que 0019 haya usado el nombre autogenerado
-- exacto. Los pasos 2 y 3 usan DROP CONSTRAINT/POLICY IF EXISTS + CREATE,
-- mismo patrón que 0026-0029, por lo que también son reejecutables. No
-- se borra ni modifica ninguna fila existente de `reports`,
-- `report_evidence` ni `moderation_actions`.
-- ============================================================

-- ------------------------------------------------------------
-- 1. reported_job_id: ON DELETE CASCADE → ON DELETE SET NULL
-- ------------------------------------------------------------
do $$
declare
  fk_name text;
begin
  select tc.constraint_name into fk_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
   and tc.table_schema = kcu.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'reports'
    and tc.constraint_type = 'FOREIGN KEY'
    and kcu.column_name = 'reported_job_id';

  if fk_name is not null then
    execute format('alter table public.reports drop constraint %I', fk_name);
  end if;
end $$;

alter table public.reports
  add constraint reports_reported_job_id_fkey
  foreign key (reported_job_id) references public.jobs(id) on delete set null;

-- ------------------------------------------------------------
-- 2. reports_target_matches_type: permite el estado histórico
--    target_type='job' AND reported_job_id is null (post-borrado del
--    job). El caso target_type='user' no cambia.
-- ------------------------------------------------------------
alter table public.reports drop constraint if exists reports_target_matches_type;
alter table public.reports
  add constraint reports_target_matches_type check (
    (target_type = 'user' and reported_user_id is not null and reported_job_id is null)
    or
    (target_type = 'job' and reported_user_id is null)
  );

-- ------------------------------------------------------------
-- 3. reports_insert_own: un reporte NUEVO sigue exigiendo
--    reported_job_id/reported_user_id según corresponda — el estado
--    histórico con reported_job_id=null solo puede producirlo el motor
--    (ON DELETE SET NULL), nunca un INSERT de cliente.
-- ------------------------------------------------------------
drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
  on public.reports for insert
  to authenticated
  with check (
    reporter_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and admin_notes is null
    and (
      (target_type = 'job' and reported_job_id is not null)
      or
      (target_type = 'user' and reported_user_id is not null)
    )
  );
