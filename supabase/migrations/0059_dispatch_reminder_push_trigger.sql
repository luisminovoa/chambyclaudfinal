-- ============================================================
-- CHAMBY — P1-B2.6 (Web Push): trigger real que conecta
-- notifications(type='reminder') con la Edge Function `send-push`.
-- ============================================================
-- Alcance exclusivo de esta migración: `pg_net`, una función trigger
-- SECURITY DEFINER y el trigger mismo sobre `notifications`. NO modifica
-- 0004 (notifications), NO modifica 0056 (job_reminders/
-- send_job_reminders()/el cron), NO modifica 0057 (push_subscriptions),
-- NO modifica 0058 (push_dispatched_at) — reutiliza esa columna tal cual
-- ya existe, sin tocar su semántica. NO inserta datos, NO modifica filas
-- existentes.
--
-- REQUISITO DE CONFIGURACIÓN PENDIENTE (fuera de alcance de esta
-- migración — NO se ejecuta aquí, es responsabilidad de una fase de
-- configuración de secrets separada, explícitamente autorizada aparte):
-- esta migración NO funciona hasta que existan, en Supabase Vault
-- (`supabase_vault`, ya instalado en este proyecto), dos secretos:
--   - `chamby_push_secret`        — el mismo valor que `CHAMBY_PUSH_SECRET`
--                                    configurado como secret de la Edge
--                                    Function `send-push` (P1-B2.3).
--   - `chamby_push_function_url`  — la URL completa de la Edge Function
--                                    desplegada, p.ej.
--                                    https://<project-ref>.supabase.co/functions/v1/send-push
-- Se crean con `select vault.create_secret('<valor>', 'chamby_push_secret', '...')`
-- — un INSERT de datos, nunca parte de un archivo de migración
-- versionado. Mientras esos dos secretos no existan, el trigger no falla
-- ni bloquea nada: simplemente no programa ningún despacho (ver
-- `dispatch_reminder_push()` más abajo) — el sistema queda exactamente
-- en el mismo estado funcional que sin esta migración, hasta que se
-- complete esa configuración.
--
-- Por qué ni el secreto ni la URL se hardcodean aquí: `CHAMBY_PUSH_SECRET`
-- es, por definición, un secreto — nunca debe existir en texto plano en
-- un archivo versionado en Git. La URL de la Edge Function, aunque no es
-- secreta en sí misma, tampoco tiene hoy ninguna convención de
-- configuración por entorno accesible desde SQL (a diferencia de
-- NEXT_PUBLIC_SUPABASE_URL en TypeScript) — inventar un valor de
-- proyecto aquí sería exactamente lo que esta fase prohíbe. Guardar
-- ambos en Vault evita los dos problemas a la vez y hace que el mismo
-- archivo de migración sea válido para cualquier entorno (local/staging/
-- producción) sin modificarlo.
-- ============================================================

create extension if not exists pg_net;

-- ------------------------------------------------------------
-- Función trigger — SECURITY DEFINER porque `authenticated` no tiene (ni
-- debe tener) acceso a `vault.decrypted_secrets` ni a `net.http_post()`;
-- corre con los privilegios de su dueño (postgres), igual que el resto
-- de triggers de notificación desde 0004.
--
-- Garantía central de esta función: NUNCA debe poder abortar el INSERT
-- que la disparó. Todo el cuerpo vive dentro de un bloque
-- `EXCEPTION WHEN OTHERS` — un fallo de Vault, de pg_net, una URL o
-- secreto ausente, o cualquier otro error inesperado se registra con
-- `RAISE WARNING` (que no aborta la transacción) y la función retorna
-- normalmente. `net.http_post()` en sí mismo es asíncrono: encola la
-- petición y retorna de inmediato sin esperar la respuesta HTTP — la
-- notification nunca espera a que `send-push` termine, y un timeout o
-- una Edge Function caída no tiene forma de revertir la creación de la
-- notification.
-- ------------------------------------------------------------
create or replace function public.dispatch_reminder_push()
returns trigger
language plpgsql
security definer
set search_path = public, vault, net
as $function$
declare
  v_secret text;
  v_function_url text;
begin
  begin
    select decrypted_secret into v_secret
      from vault.decrypted_secrets
      where name = 'chamby_push_secret'
      limit 1;

    select decrypted_secret into v_function_url
      from vault.decrypted_secrets
      where name = 'chamby_push_function_url'
      limit 1;

    if v_secret is null or v_function_url is null then
      -- Configuración pendiente (ver nota de cabecera) — nunca bloquear
      -- la creación de la notification por esto.
      return new;
    end if;

    -- Payload mínimo: únicamente el id. `send-push` (P1-B2.2/P1-B2.5.1)
    -- vuelve a leer la fila real de `notifications` por este id — nunca
    -- confía en nada más que este trigger pudiera enviarle. Nunca se
    -- incluye title/body/user_id/PII ni ningún dato de push_subscriptions.
    perform net.http_post(
      url := v_function_url,
      body := jsonb_build_object('notification_id', new.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-chamby-push-secret', v_secret
      ),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning
      'dispatch_reminder_push: no se pudo programar el despacho de push para notification %: %',
      new.id, sqlerrm;
  end;

  return new;
end;
$function$;

-- ------------------------------------------------------------
-- Trigger — únicamente AFTER INSERT, únicamente `type = 'reminder'`.
-- La condición `WHEN` la evalúa Postgres ANTES de invocar la función:
-- para cualquier otro tipo, `dispatch_reminder_push()` ni siquiera se
-- ejecuta. UPDATE/DELETE nunca lo disparan — no es necesario reaccionar
-- a ellos (ningún flujo existente actualiza `notifications.type` después
-- de crearla, y el despacho de push solo tiene sentido en el momento de
-- creación).
-- ------------------------------------------------------------
drop trigger if exists trg_dispatch_reminder_push on public.notifications;
create trigger trg_dispatch_reminder_push
  after insert on public.notifications
  for each row
  when (new.type = 'reminder')
  execute function public.dispatch_reminder_push();

-- ------------------------------------------------------------
-- Cierre de privilegios — mismo patrón que send_job_reminders() (0056):
-- toda función nueva creada por postgres en public recibe EXECUTE
-- automático para PUBLIC y para authenticated/service_role (default ACL
-- de este proyecto). PostgREST no expone funciones que retornan `trigger`
-- como RPC invocable, así que esto es defensa en profundidad (no hay una
-- ruta conocida para que `authenticated` la invoque directamente), no el
-- único control — pero se aplica de todas formas por consistencia con el
-- resto del proyecto.
-- ------------------------------------------------------------
revoke execute on function public.dispatch_reminder_push() from public;
revoke execute on function public.dispatch_reminder_push() from authenticated;
