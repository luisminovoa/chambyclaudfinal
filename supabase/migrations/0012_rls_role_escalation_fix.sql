-- ============================================================
-- CHAMBY — Sprint v0.7 (Blindaje de seguridad)
-- Corrige V1 + V4: escalada de privilegios de administrador
-- ============================================================
-- Causa raíz compartida: profiles_update_own y user_roles_update_own
-- son políticas UPDATE con USING pero sin WITH CHECK. En Postgres,
-- una policy UPDATE sin WITH CHECK reutiliza USING sobre la fila
-- resultante; como ninguna de las dos referencia role/is_active,
-- cualquier valor queda sin protección tras el UPDATE.
--
-- Explotación confirmada (ver docs/SPRINT-v0.7-RLS-PLAN.md, V1 y V4):
--   1. UPDATE profiles SET role='admin' WHERE id=auth.uid()   (worker → admin directo)
--   2. UPDATE user_roles SET role='admin' WHERE user_id=auth.uid()
--      seguido de switchRoleAction('admin') (src/lib/actions/roles.ts)
--      → el propio Server Action ejecuta el UPDATE de (1) como el
--      usuario no-admin, aprovechando el registro forjado en user_roles.
--
-- Se corrigen ambas en la misma migración porque comparten el mismo
-- objetivo de ataque (profiles.role = 'admin') y son la misma capa
-- de autorización (RLS del sistema de roles) — ver docs/SPRINT-v0.7-RLS-PLAN.md
-- secciones 4 y 5.
-- ============================================================

-- ------------------------------------------------------------
-- profiles_update_own
-- Permite al dueño seguir editando su perfil y alternar
-- role entre 'worker'/'employer' (switchRoleAction), pero nunca
-- fijar role='admin' ni tocar is_active, salvo que el propio
-- llamante ya sea admin (changeUserRole/toggleUserActive en
-- src/lib/actions/admin.ts, ambos detrás de assertAdmin()).
-- ------------------------------------------------------------
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id or public.current_user_role() = 'admin')
  with check (
    public.current_user_role() = 'admin'
    or (
      auth.uid() = id
      and role in ('worker', 'employer')
      and is_active = (select p.is_active from public.profiles p where p.id = auth.uid())
    )
  );

-- ------------------------------------------------------------
-- user_roles_update_own
-- Mismo criterio que user_roles_insert_own (0008_multi_role.sql):
-- el propio usuario solo puede poseer worker/employer, nunca admin.
-- La policy original nunca tuvo bypass de admin en USING, así que
-- no se introduce uno aquí — se mantiene el mismo alcance.
-- ------------------------------------------------------------
drop policy if exists "user_roles_update_own" on public.user_roles;
create policy "user_roles_update_own"
  on public.user_roles for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and role::text in ('worker', 'employer')
  );
