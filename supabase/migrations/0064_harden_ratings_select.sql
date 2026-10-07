-- ============================================================
-- CHAMBY — SEC: restringir la lectura de public.ratings
--
-- Hallazgo (auditoría de solo lectura, verificado en producción):
--   · `ratings_select_all` (0001) es FOR SELECT TO public USING (true) y
--     `anon` tiene SELECT sobre la tabla: cualquier visitante con la anon
--     key podía leer TODAS las calificaciones individuales — comment
--     (texto libre), score, rater_id, rated_id y job_id — y reconstruir
--     quién calificó a quién en qué trabajo.
--   · La aplicación NO necesita esa lectura pública. Las únicas lecturas
--     directas de la tabla son:
--       - dashboard/worker  : filas con rated_id = auth.uid()  (reseñas recibidas)
--       - dashboard/worker  : filas con rater_id = auth.uid()  (qué ya calificó)
--       - dashboard/employer: filas con rater_id = auth.uid()  (qué ya calificó)
--       - admin/page        : count(*) con sesión de admin
--       - beta.ts           : service_role (ignora RLS)
--     Lo público (reputación del empleador en /employers/[id] y /jobs/[id])
--     sale de la vista rating_summary, no de esta tabla.
--
-- Efecto de esta migración:
--   1. Se elimina `ratings_select_all`.
--   2. Se crea `ratings_select_own_or_admin`, FOR SELECT TO authenticated:
--      una persona solo ve las calificaciones que emitió (rater_id) o
--      recibió (rated_id); un admin ve todas.
--      Es TO authenticated a propósito: `anon` nunca evalúa la policy (y
--      no ejecuta current_user_role(), cuyo EXECUTE se revocó a anon en
--      0063).
--   3. Se revoca SELECT sobre la tabla a `anon` (defensa en profundidad:
--      un visitante recibe 42501 en vez de una lista vacía).
--
-- NO cambia:
--   · rating_summary: vista definer (owner postgres, sin security_invoker),
--     lee con los permisos de su owner. `ratings` tiene RLS pero NO
--     FORCE ROW LEVEL SECURITY, así que la vista sigue viendo todas las
--     filas y las páginas públicas siguen funcionando.
--   · ratings_insert_participant (0007) ni ningún permiso de INSERT.
--     (anon conserva el privilegio INSERT, pero la policy exige
--     auth.uid() = rater_id, así que no puede insertar; revocarlo es un
--     tema aparte.)
--   · service_role: conserva SELECT (y, en Supabase, BYPASSRLS).
--   · Ninguna otra tabla, función, vista ni código de aplicación.
--
-- Idempotente: DROP POLICY IF EXISTS sobre ambas policies y REVOKE sobre un
-- privilegio ya ausente no fallan; se puede aplicar más de una vez.
-- ============================================================

drop policy if exists "ratings_select_all" on public.ratings;
drop policy if exists "ratings_select_own_or_admin" on public.ratings;

create policy "ratings_select_own_or_admin"
  on public.ratings for select
  to authenticated
  using (
    rater_id = auth.uid()
    or rated_id = auth.uid()
    or public.current_user_role() = 'admin'
  );

revoke select on public.ratings from anon;
