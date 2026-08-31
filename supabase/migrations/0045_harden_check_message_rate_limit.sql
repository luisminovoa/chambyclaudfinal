-- ============================================================
-- CHAMBY — SEC-001: check_message_rate_limit() confía en p_sender_id
-- sin validarlo contra auth.uid(), y conserva EXECUTE heredado de PUBLIC.
--
-- Hallazgo (auditoría SEC-001, clasificado CONFIRMED / LOW): la función
-- (0003_chat_extensions.sql) es SECURITY DEFINER — corre con los
-- privilegios de su owner, sin pasar por messages_select_participant —
-- y cuenta mensajes de `p_sender_id` en `p_conversation_id` sin
-- verificar en ningún momento que quien invoca el RPC sea realmente ese
-- sender ni que participe en esa conversación. El único call site real
-- (src/lib/actions/chat.ts) siempre pasa p_sender_id: user.id (su propio
-- auth.uid()), pero nada en la base de datos impide invocar el RPC
-- directamente (POST /rest/v1/rpc/check_message_rate_limit) con un
-- p_sender_id/p_conversation_id arbitrarios, ya que la función retenía
-- el privilegio EXECUTE por defecto de PostgreSQL sobre PUBLIC (ninguna
-- función de todo el esquema tiene un GRANT/REVOKE EXECUTE explícito).
--
-- Impacto acotado (LOW, no MEDIUM/HIGH): la función es de solo lectura
-- (un SELECT count(*), sin escritura), no permite manipular el rate
-- limit de otro usuario ni evadir el propio, y ambos parámetros son
-- UUID v4 no enumerables — solo revela un booleano ("¿este sender envió
-- ≥30 mensajes en los últimos 60s en esta conversación?") a quien ya
-- conozca de antemano los dos UUID correctos, información que en la
-- práctica ya poseen los propios participantes de esa conversación vía
-- RLS legítima. Aun así, es un gap real de diseño (SECURITY DEFINER que
-- confía ciegamente en un parámetro de identidad) que se cierra aquí
-- con el fix mínimo correcto.
--
-- FIX (dos capas independientes, ninguna cambia la firma ni el
-- comportamiento del único call site real):
--
--   1. Validación interna: si auth.uid() es null (no debería ocurrir
--      tras el paso 2, pero se defiende igual — mismo patrón de
--      "cinturón y tirantes" ya usado en el resto del esquema, p. ej.
--      prevent_zero_active_roles()) o distinto de p_sender_id, la
--      función retorna `false` de inmediato, sin llegar a contar
--      mensajes de un sender ajeno. Se usa `IS DISTINCT FROM` (no `<>`)
--      porque `<>` con cualquier lado NULL produce NULL en SQL, y un
--      `IF NULL THEN ...` en plpgsql NUNCA ejecuta esa rama (se trata
--      igual que `false`) — con `<>` un auth.uid() NULL habría dejado
--      pasar la validación sin querer, exactamente el bypass por NULL
--      que esta migración debe impedir. `IS DISTINCT FROM` compara
--      NULLs de forma segura: null IS DISTINCT FROM '<uuid>' = true.
--
--   2. Privilegios: se revoca EXECUTE de PUBLIC (de donde anon y
--      authenticated heredaban el privilegio por defecto) y se
--      re-otorga EXECUTE solo a `authenticated`. anon queda sin ningún
--      camino para invocar esta función, ni siquiera antes de que la
--      validación interna del paso 1 se evalúe.
--
-- Se preserva exactamente la firma (uuid, uuid, integer, integer),
-- SECURITY DEFINER y `set search_path = public` — ninguno de los tres
-- se toca. No se modifica 0003_chat_extensions.sql (migración ya
-- potencialmente aplicada) ni ninguna policy RLS de `messages`. No se
-- introduce SQL dinámico. src/lib/actions/chat.ts no requiere ningún
-- cambio: ya pasaba p_sender_id: user.id, el único caso que esta
-- migración deja sin alterar.
--
-- No confirmado en Supabase real en esta fase (acceso live
-- unavailable, mismo estado que SEC-002) — esta migración queda
-- preparada en Git, sin aplicar a producción.
-- ============================================================

create or replace function public.check_message_rate_limit(
  p_conversation_id uuid,
  p_sender_id       uuid,
  p_window_seconds  int default 60,
  p_max_messages    int default 30
) returns boolean as $$
declare v_count int;
begin
  if auth.uid() is null or p_sender_id is distinct from auth.uid() then
    return false;
  end if;

  select count(*) into v_count
  from public.messages
  where conversation_id = p_conversation_id
    and sender_id = p_sender_id
    and created_at > now() - (p_window_seconds || ' seconds')::interval;
  return v_count < p_max_messages;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute
  on function public.check_message_rate_limit(uuid, uuid, int, int)
  from public;

grant execute
  on function public.check_message_rate_limit(uuid, uuid, int, int)
  to authenticated;
