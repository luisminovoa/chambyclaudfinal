-- ============================================================
-- CHAMBY — Fase 9: guardia de máquina de estados de reports (N-STATE-1)
--
-- Hallazgo (auditoría Fase 8, N-STATE-1, confirmado en Fase 9): la única
-- validación de REPORT_STATUS_TRANSITIONS (src/lib/report-config.ts)
-- vive en updateReportStatus() (src/lib/actions/admin-reports.ts) — un
-- lugar puramente de aplicación. Ni reports_update_admin (0019, RLS) ni
-- el GRANT de columna sobre `status` (0019) distinguen QUÉ valor nuevo
-- se está escribiendo, solo QUIÉN lo escribe (role='admin'). Eso
-- significa que un admin autenticado con un JWT válido, llamando a
-- PostgREST directamente (sin pasar por la Server Action de Next.js),
-- podría hacer `PATCH /rest/v1/reports?id=eq.<id>` con
-- `{"status": "pending"}` sobre un reporte 'resolved'/'dismissed' y la
-- base de datos lo aceptaría sin objeción — rompiendo un invariante que
-- el diseño declara explícitamente (Fase 3: "explícitamente NO
-- reabrir"). Requiere ya tener credenciales de admin (no es una
-- escalada de privilegios ni afecta a usuarios normales), pero es un
-- bypass real de una regla de negocio explícita — CASO 3 según la
-- clasificación de la Fase 9, severidad baja/media.
--
-- Alternativas evaluadas (ver informe de Fase 9):
--   A) CHECK constraint — descartada: un CHECK de Postgres solo ve la
--      fila NUEVA que se está escribiendo, nunca la fila anterior — no
--      puede expresar "el valor previo de esta misma fila era X"
--      (a diferencia de un `WHERE` de una consulta, aquí no hay acceso
--      a OLD dentro de la definición de un CHECK).
--   B) Trigger BEFORE UPDATE que lee OLD.status/NEW.status — ELEGIDA.
--      Mismo patrón ya usado en el proyecto para inspeccionar
--      OLD/NEW (handle_application_accepted(), 0002_hiring_tracking.sql;
--      notify_report_status_changed(), 0023_report_notifications.sql),
--      extendido aquí para RECHAZAR en vez de solo reaccionar.
--   C) No existe en el proyecto un mecanismo Postgres ya construido que
--      resuelva "validar la transición anterior→nueva de una columna
--      enum" — no había nada equivalente que reutilizar sin
--      modificar.
--
-- A diferencia de enforce_report_evidence_limit() (0024), esta función
-- NO necesita `security definer`: no lee ninguna otra fila ni tabla —
-- solo compara OLD.status y NEW.status de la fila que Postgres ya le
-- entrega en el trigger, con los privilegios del invocador. Elevar
-- privilegios aquí violaría el principio de mínimo privilegio sin
-- ninguna necesidad real (ver 0013/0019: "candado de columna" ya cubre
-- el control de acceso; este trigger solo agrega control de VALOR).
--
-- Concurrencia: NO se necesita un advisory lock (a diferencia de 0024,
-- que sí lo necesita porque agrega/cuenta FILAS DISTINTAS de la misma
-- tabla). Aquí Postgres ya serializa el acceso mediante el lock de fila
-- estándar de todo UPDATE: dos UPDATE concurrentes contra el MISMO
-- report.id nunca corren en paralelo — el segundo espera a que el
-- primero libere el lock de fila (commit/rollback) y entonces vuelve a
-- evaluar su propio OLD.status ya contra el valor recién confirmado. La
-- guarda optimista existente en updateReportStatus()
-- (`.eq("status", currentStatus)`, admin-reports.ts) sigue intacta y
-- sigue siendo la primera línea de defensa (falla rápido con un mensaje
-- claro de "el estado cambió mientras procesabas esta acción"); este
-- trigger es la garantía real de que ningún camino — ni siquiera uno
-- que se salte esa guarda optimista — puede escribir una transición
-- fuera de las 4 oficiales.
--
-- Compatibilidad con datos existentes: esta migración NO valida filas
-- ya existentes — un trigger BEFORE UPDATE solo se dispara en updates
-- FUTUROS, nunca retroactivamente sobre filas ya almacenadas. No hay
-- riesgo de que la migración falle por datos actuales, sin importar en
-- qué `status` estén. (No se pudo verificar el estado real de ninguna
-- base de staging/producción en este entorno — no aplica de todos
-- modos, dado que un trigger no re-valida filas históricas.)
-- ============================================================

create or replace function public.enforce_report_status_transition()
returns trigger as $$
begin
  -- Un UPDATE que no cambia `status` (p.ej. solo admin_notes/reviewed_by/
  -- reviewed_at/updated_at) nunca es una "transición" — no debe bloquearse.
  if new.status is distinct from old.status then
    if not (
      (old.status = 'pending'      and new.status in ('under_review', 'dismissed'))
      or (old.status = 'under_review' and new.status in ('resolved', 'dismissed'))
    ) then
      raise exception 'report_status_transition_invalid: % -> % no es una transición permitida', old.status, new.status
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_report_status_transition on public.reports;
create trigger trg_report_status_transition
  before update on public.reports
  for each row execute function public.enforce_report_status_transition();
