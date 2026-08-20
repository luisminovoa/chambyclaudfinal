-- ============================================================
-- CHAMBY — moderation_actions: coherencia target_user_id también
-- para reportes de tipo 'job' (no se modifica 0027)
--
-- Hallazgo: recordModerationAction() (src/lib/actions/admin-reports.ts)
-- derivaba target_user_id directamente de reports.reported_user_id, sin
-- importar target_type. Para un reporte target_type='job',
-- reported_user_id es SIEMPRE null (reports_target_matches_type, 0019)
-- — así que toda acción de moderación (warning_issued/temporary_
-- suspension/permanent_block) contra una oferta reportada quedaba con
-- target_user_id=null, y notify_moderation_action() (0023) nunca
-- notificaba al empleador, porque exige `target_user_id is not null`.
--
-- enforce_moderation_action_target_coherence() (0027) ya impedía —sin
-- proponérselo explícitamente— que se insertara un target_user_id no
-- nulo para un reporte de tipo 'job': comparaba siempre contra
-- reports.reported_user_id, que para 'job' es null, así que CUALQUIER
-- target_user_id no nulo quedaba rechazado por el trigger
-- (v_reported_user_id is null -> mismatch). Es decir, el trigger no
-- dejaba pasar un target_user_id incorrecto para 'job' — dejaba pasar
-- CERO target_user_id, incluido el correcto. La corrección de código en
-- recordModerationAction() (turno actual) resuelve target_user_id como
-- jobs.employer_id vía reports.reported_job_id para 'job' — este
-- trigger debe extenderse para validar ESE valor específicamente, o
-- toda inserción con el target_user_id correcto seguiría siendo
-- rechazada por la base de datos.
--
-- Esto NO debilita la garantía existente: la rama target_type='user'
-- queda exactamente igual (misma comparación, mismo mensaje de error).
-- Se agrega una rama nueva, más completa, para target_type='job' —
-- coherente con el mismo principio de "candado a nivel de base de
-- datos, no solo de aplicación" que ya rige el resto del esquema.
--
-- Caso reported_job_id=null (reports_survive_job_deletion, 0031): un
-- reporte de tipo 'job' cuya oferta ya fue eliminada no tiene ningún
-- empleador real al que atribuir la acción. Este trigger RECHAZA
-- cualquier target_user_id no nulo en ese caso (no hay employer_id
-- contra el cual validar) — la aplicación, por su parte, nunca debe
-- intentarlo (ver recordModerationAction(): controla este caso ANTES
-- de llegar a la base de datos y devuelve un error explícito al admin
-- para warning_issued/temporary_suspension/permanent_block, sin
-- inventar un destinatario). target_user_id=null sigue permitido sin
-- restricción para note_added sobre cualquier reporte 'job' (con o sin
-- oferta viva), igual que ya documentaba 0027 para ese caso.
--
-- Sin SECURITY DEFINER, igual que 0027: jobs_select_all (0001) es
-- `using (true)` — el admin invocador (ya autenticado y validado por
-- moderation_actions_insert_admin, 0020) puede leer employer_id de
-- cualquier job sin necesitar privilegios elevados.
-- ============================================================

create or replace function public.enforce_moderation_action_target_coherence()
returns trigger as $$
declare
  v_target_type      public.report_target_type;
  v_reported_user_id  uuid;
  v_reported_job_id   uuid;
  v_job_employer_id   uuid;
begin
  if new.target_user_id is not null then
    if new.report_id is null then
      raise exception 'moderation_action_target_mismatch: target_user_id requiere un report_id válido'
        using errcode = 'P0001';
    end if;

    select target_type, reported_user_id, reported_job_id
      into v_target_type, v_reported_user_id, v_reported_job_id
      from public.reports
      where id = new.report_id;

    if v_target_type = 'user' then
      if v_reported_user_id is null or v_reported_user_id <> new.target_user_id then
        raise exception 'moderation_action_target_mismatch: target_user_id no coincide con reports.reported_user_id del report_id referenciado'
          using errcode = 'P0001';
      end if;

    elsif v_target_type = 'job' then
      if v_reported_job_id is null then
        raise exception 'moderation_action_target_mismatch: el reporte de tipo job no tiene reported_job_id (la oferta fue eliminada) — no existe ningún destinatario válido'
          using errcode = 'P0001';
      end if;

      select employer_id into v_job_employer_id
        from public.jobs
        where id = v_reported_job_id;

      if v_job_employer_id is null or v_job_employer_id <> new.target_user_id then
        raise exception 'moderation_action_target_mismatch: target_user_id no coincide con el employer_id de la oferta reportada'
          using errcode = 'P0001';
      end if;

    else
      -- No debería alcanzarse: report_id ya se validó not null arriba, y
      -- la FK moderation_actions.report_id -> reports(id) garantiza que
      -- la fila referenciada existe, así que target_type siempre debería
      -- resolverse a 'user' o 'job'. Se rechaza explícitamente en vez de
      -- dejar pasar sin validar, por si algún estado futuro del enum
      -- report_target_type quedara sin cubrir aquí.
      raise exception 'moderation_action_target_mismatch: no se pudo determinar el tipo de objetivo del reporte referenciado'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

-- El trigger ya existe (0027) y apunta a esta misma función por nombre
-- — CREATE OR REPLACE FUNCTION es suficiente, no hace falta recrear el
-- trigger en sí.
