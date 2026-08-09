-- ============================================================
-- CHAMBY — Notificaciones de moderación (Fase 4, Parte G/H)
--
-- El sistema de notificaciones existente (0004_notifications.sql) NO
-- tiene policy INSERT para `authenticated` a propósito ("evita que
-- usuarios creen notificaciones propias") — todo INSERT en
-- `notifications` pasa por triggers `security definer`
-- (notify_new_application, notify_application_status_changed,
-- notify_new_message, notify_job_status_changed, notify_new_rating en
-- 0004; notify_document_status_changed en 0016). Esta migración sigue
-- exactamente ese mismo patrón — ningún Server Action inserta en
-- `notifications` directamente, dos triggers nuevos lo hacen.
--
-- `notifications.type` es `text not null` sin CHECK (confirmado en el
-- DDL de 0004), así que los dos valores nuevos ('report_status_update',
-- 'moderation_action') no requieren alterar la tabla — solo se
-- documentan aquí y se agregan al union de TypeScript `NotificationType`
-- (src/lib/types.ts).
-- ============================================================

-- ------------------------------------------------------------
-- Trigger: cambio de estado de un reporte → notifica al reportante
--
-- Mensaje genérico por diseño (Fase 4, Parte G): nunca incluye
-- admin_notes, reviewed_by, ni el motivo/descripción original. Cubre
-- las tres transiciones que le importan al reportante
-- (pending→under_review, pending→dismissed, {pending,under_review}
-- →resolved) — que, dado el conjunto de transiciones permitidas por
-- updateReportStatus() (REPORT_STATUS_TRANSITIONS, Fase 3), son en la
-- práctica *todas* las transiciones posibles, así que la condición
-- real es simplemente "el estado cambió" con el texto elegido según
-- new.status.
-- ------------------------------------------------------------
create or replace function public.notify_report_status_changed()
returns trigger as $$
declare
  v_title text;
  v_body  text;
begin
  if new.status is distinct from old.status then
    if new.status = 'under_review' then
      v_title := 'Tu reporte está siendo revisado';
      v_body  := 'Nuestro equipo está revisando el reporte que enviaste.';
    elsif new.status = 'dismissed' then
      v_title := 'Tu reporte ha sido cerrado';
      v_body  := 'Revisamos tu reporte y no encontramos motivo para tomar una acción adicional.';
    elsif new.status = 'resolved' then
      v_title := 'Tu reporte fue revisado';
      v_body  := 'Revisamos tu reporte y se tomó una decisión al respecto. Gracias por ayudarnos a mantener Chamby seguro.';
    else
      return new;
    end if;

    insert into public.notifications
      (user_id, type, title, body, data, priority)
    values (
      new.reporter_id,
      'report_status_update',
      v_title,
      v_body,
      jsonb_build_object('reportId', new.id),
      'normal'
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_report_status_changed on public.reports;
create trigger on_report_status_changed
  after update on public.reports
  for each row execute function public.notify_report_status_changed();

-- ------------------------------------------------------------
-- Trigger: acción de moderación con consecuencia real → notifica al
-- usuario denunciado.
--
-- Solo action_type in ('warning_issued','temporary_suspension',
-- 'permanent_block') — nunca 'note_added' (interno, sin consecuencia)
-- ni 'status_changed' (el registro automático que ya inserta
-- updateReportStatus() en cada cambio de estado, Fase 3 — notificar
-- eso sería indistinguible de "fuiste reportado"). El texto es
-- deliberadamente genérico: nunca menciona report_id, reporter_id,
-- action_type textual, ni el motivo — evita que el denunciado deduzca
-- quién lo reportó o por qué, aunque tenga pocas interacciones
-- recientes en la plataforma.
-- ------------------------------------------------------------
create or replace function public.notify_moderation_action()
returns trigger as $$
begin
  if new.target_user_id is not null
     and new.action_type in ('warning_issued', 'temporary_suspension', 'permanent_block') then
    insert into public.notifications
      (user_id, type, title, body, data, priority)
    values (
      new.target_user_id,
      'moderation_action',
      'Acción de moderación en tu cuenta',
      'Se ha realizado una acción de moderación relacionada con tu cuenta. Si tienes dudas, contacta a soporte.',
      '{}'::jsonb,
      'high'
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_moderation_action_inserted on public.moderation_actions;
create trigger on_moderation_action_inserted
  after insert on public.moderation_actions
  for each row execute function public.notify_moderation_action();
