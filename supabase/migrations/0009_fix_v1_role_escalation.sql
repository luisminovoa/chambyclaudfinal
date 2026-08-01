-- ============================================================
-- CHAMBY — Sprint de Seguridad: corrige V1 (escalada directa de admin)
--
-- Vulnerabilidad: "profiles_update_own" (0001_init.sql) es una policy
-- UPDATE con USING pero sin WITH CHECK. En Postgres, una policy UPDATE
-- sin WITH CHECK reutiliza USING sobre la fila resultante — y USING
-- solo exige `auth.uid() = id`, sin mirar la columna `role`. Cualquier
-- usuario autenticado podía ejecutar:
--
--   update public.profiles set role = 'admin' where id = auth.uid();
--
-- y quedar con `role = 'admin'`, que es lo que consume
-- `current_user_role()` — usada por prácticamente todas las demás
-- policies admin-gated del esquema. Esto es escalada de privilegios
-- directa a control administrativo total.
--
-- Alcance de este fix: ÚNICAMENTE la policy "profiles_update_own".
-- No se toca `is_active`, `user_roles`, `switchRoleAction()` ni ningún
-- otro componente del sistema multi-rol — ese sistema no existe en esta
-- rama y su eventual escalada asociada (V4) queda fuera de alcance hasta
-- que se proponga y apruebe por separado (ver
-- docs/SECURITY_AUDIT_v0.8.md).
-- ============================================================

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id or public.current_user_role() = 'admin')
  with check (
    public.current_user_role() = 'admin'
    or (auth.uid() = id and role in ('worker', 'employer'))
  );
