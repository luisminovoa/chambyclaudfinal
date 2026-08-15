-- ============================================================
-- CHAMBY — Fase 10: coherencia target_user_id/report_id en moderation_actions
--
-- Hallazgo (auditoría Fase 10, mismo patrón que N-STATE-1/0026):
-- recordModerationAction() (src/lib/actions/admin-reports.ts) SIEMPRE
-- deriva `target_user_id` del propio `reports.reported_user_id` en el
-- servidor — nunca acepta ese valor del cliente (ver el docstring de la
-- función, que lo declara explícitamente como garantía de seguridad).
-- Pero moderation_actions_insert_admin (0020) solo exige
-- `role='admin' and admin_id=auth.uid()` — nada a nivel de base de
-- datos ata `target_user_id` al `reported_user_id` real del
-- `report_id` referenciado. Un admin con JWT válido, llamando a
-- PostgREST directamente, podría insertar una fila con `target_user_id`
-- apuntando a CUALQUIER usuario (incluso con `report_id = null`, o con
-- un `report_id` real pero de un reporte que no lo involucra). Esto
-- tiene consecuencia real, no solo de auditoría: notify_moderation_
-- action() (0023) SÍ dispara una notificación real de prioridad `high`
-- ("Se ha realizado una acción de moderación relacionada con tu
-- cuenta") para action_type in ('warning_issued','temporary_suspension',
-- 'permanent_block') — un usuario nunca reportado podría recibir un
-- aviso de sanción fabricado, y moderation_actions es append-only (sin
-- UPDATE/DELETE, 0020), así que el registro falso queda permanente.
-- CASO 3 (bypass real), severidad media: requiere ya tener credenciales
-- de admin, no es escalada de privilegios, pero rompe el propósito
-- explícito de la tabla (0020: "¿por qué fue suspendido este
-- usuario?") con una entrada sin respaldo real.
--
-- Alternativa CHECK constraint descartada por el mismo motivo que en
-- 0026: un CHECK no puede hacer lookup contra otra tabla (`reports`).
-- Trigger BEFORE INSERT, mismo patrón que 0026_report_status_
-- transition_guard.sql. SIN `security definer`: el admin que ejecuta el
-- INSERT (ya exigido por moderation_actions_insert_admin) tiene acceso
-- de SELECT sobre CUALQUIER fila de `reports` vía reports_select_own_or_
-- admin (0019) — la función no necesita privilegios elevados para leer
-- lo que el invocador ya puede leer.
--
-- Regla: si `target_user_id` no es nulo, `report_id` debe ser no nulo Y
-- debe referenciar un reporte cuyo `reported_user_id` sea exactamente
-- ese mismo valor. Si `target_user_id` es nulo (p.ej. note_added sobre
-- un reporte de tipo 'job', donde reported_user_id es legítimamente
-- nulo — ver reports_target_matches_type, 0019), no se exige nada: no
-- hay a quién notificar ni a quién atribuir la acción.
--
-- No se toca moderation_actions_insert_admin (0020) ni ninguna policy
-- existente — este trigger es aditivo, igual que 0026 respecto a
-- REPORT_STATUS_TRANSITIONS. No hay UPDATE/DELETE policy en
-- moderation_actions (append-only, 0020), así que un trigger BEFORE
-- INSERT cubre el único vector de escritura posible.
--
-- Compatibilidad con datos existentes: un trigger BEFORE INSERT no
-- revalida filas ya almacenadas, solo INSERTs futuros — sin riesgo para
-- datos actuales, sin importar su contenido. No se pudo verificar el
-- estado real de ninguna base de staging/producción en este entorno —
-- no aplica de todos modos por la razón anterior.
-- ============================================================

create or replace function public.enforce_moderation_action_target_coherence()
returns trigger as $$
declare
  v_reported_user_id uuid;
begin
  if new.target_user_id is not null then
    if new.report_id is null then
      raise exception 'moderation_action_target_mismatch: target_user_id requiere un report_id válido'
        using errcode = 'P0001';
    end if;

    select reported_user_id into v_reported_user_id
    from public.reports
    where id = new.report_id;

    if v_reported_user_id is null or v_reported_user_id <> new.target_user_id then
      raise exception 'moderation_action_target_mismatch: target_user_id no coincide con reports.reported_user_id del report_id referenciado'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_moderation_action_target_coherence on public.moderation_actions;
create trigger trg_moderation_action_target_coherence
  before insert on public.moderation_actions
  for each row execute function public.enforce_moderation_action_target_coherence();
