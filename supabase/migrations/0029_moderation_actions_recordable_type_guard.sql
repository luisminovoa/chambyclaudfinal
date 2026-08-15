-- ============================================================
-- CHAMBY — Fase 12: restringe moderation_actions.action_type a los
-- valores que la aplicación realmente produce
--
-- Hallazgo (auditoría Fase 12, mismo patrón que N-STATE-1/0026,
-- 0027, 0028): `public.moderation_action_type` (0020) declara 7
-- valores, pero solo 5 de ellos son producidos hoy por algún camino
-- real de la aplicación:
--   - 'status_changed'   → SOLO por updateReportStatus() (admin-reports.ts:317-323),
--                          siempre acoplado a una transición real de
--                          reports.status ya ocurrida (guardada
--                          atómicamente por `.eq("status", currentStatus)`
--                          y por trg_report_status_transition, 0026).
--   - 'note_added' / 'warning_issued' / 'temporary_suspension' /
--     'permanent_block' → SOLO por recordModerationAction(), filtrados
--                          por RECORDABLE_ACTION_TYPES
--                          (admin-reports.ts:328-333).
-- Los otros 2 valores del enum ('account_deactivated', 'no_action')
-- están reservados para funcionalidad NO implementada todavía — el
-- propio docstring de recordModerationAction() lo declara
-- explícitamente ("no suspende, no bloquea, no desactiva ninguna
-- cuenta... queda fuera de alcance"). RECORDABLE_ACTION_TYPES los
-- excluye a propósito.
--
-- Pero moderation_actions_insert_admin (0020:71-73) solo exige
-- `current_user_role() = 'admin' and admin_id = auth.uid()` — no
-- restringe `action_type` en absoluto. Un admin con JWT válido,
-- llamando a PostgREST directamente, podría insertar una fila con
-- action_type='status_changed' SIN que reports.status haya cambiado en
-- absoluto (esta tabla no tiene ningún trigger que ate un
-- 'status_changed' a un UPDATE real de `reports`), o con
-- action_type='account_deactivated'/'no_action' reclamando una sanción
-- que la aplicación nunca ejecuta. moderation_actions es append-only
-- (sin UPDATE/DELETE, 0020) — esa fila fabricada quedaría permanente,
-- corrompiendo la precisión del historial que la propia tabla dice
-- responder ("¿por qué fue suspendido este usuario?", 0020).
--
-- CASO 3, severidad BAJA (igual orden que 0028: no dispara ninguna
-- notificación real — notify_moderation_action(), 0023, solo reacciona
-- a warning_issued/temporary_suspension/permanent_block, y
-- 'status_changed'/'account_deactivated'/'no_action' no están en esa
-- lista — el impacto se limita a la integridad del historial visible
-- únicamente para otros admins en getReportDetail()).
--
-- Regla intra-fila (no depende de OLD/auth.uid()/otra tabla) → CHECK
-- constraint, el mecanismo más simple posible — ni trigger ni RLS
-- adicional son necesarios aquí, a diferencia de 0026/0027/0028.
--
-- Nota de alcance: 'account_deactivated'/'no_action' quedan
-- deliberadamente FUERA del conjunto permitido, igual que ya están
-- fuera de RECORDABLE_ACTION_TYPES — si una fase futura implementa esa
-- funcionalidad real, esta CHECK deberá ampliarse en una nueva
-- migración (no se modifica esta) al mismo tiempo que se agregue el
-- código que realmente produzca esos valores.
--
-- Compatibilidad con datos existentes: un CHECK constraint SÍ valida
-- filas ya existentes al aplicarse (a diferencia de un trigger BEFORE
-- INSERT) — pero todas las filas insertadas hasta ahora en este
-- entorno provienen exclusivamente de updateReportStatus()/
-- recordModerationAction() (los únicos dos call sites de INSERT sobre
-- esta tabla en todo el código, confirmado por grep), que nunca
-- producen 'account_deactivated'/'no_action'. No se pudo verificar el
-- contenido real de ninguna base de staging/producción en este
-- entorno — si existiera alguna fila histórica con esos valores (fuera
-- del código auditado), esta migración fallaría al aplicarse en vez de
-- corromper datos silenciosamente, que es el comportamiento seguro
-- deseado ante esa incertidumbre.
-- ============================================================

alter table public.moderation_actions
  add constraint moderation_actions_recordable_type check (
    action_type in (
      'status_changed',
      'note_added',
      'warning_issued',
      'temporary_suspension',
      'permanent_block'
    )
  );
