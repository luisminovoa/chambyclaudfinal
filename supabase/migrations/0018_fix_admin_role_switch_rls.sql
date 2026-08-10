-- ============================================================
-- CHAMBY — Corrige el bloqueo real de Worker/Employer -> Admin en
-- profiles_update_own (causa raíz confirmada en vivo: code 42501,
-- "new row violates row-level security policy for table \"profiles\"")
--
-- CAUSA RAÍZ
-- profiles_update_own (0009_fix_v1_role_escalation.sql) tiene:
--
--   with check (
--     public.current_user_role() = 'admin'
--     or (auth.uid() = id and role in ('worker', 'employer'))
--   );
--
-- current_user_role() (0001_init.sql) es `select role from public.profiles
-- where id = auth.uid()` — una subconsulta separada contra la misma tabla
-- que se está actualizando, no una referencia correlacionada a la fila.
-- Durante la evaluación de WITH CHECK de un UPDATE, esa subconsulta ve el
-- valor PREVIO de profiles.role (Postgres no expone el propio cambio, a
-- mitad de sentencia, a una subconsulta separada sobre la misma tabla).
--
-- Consecuencia: para cualquier cuenta cuyo modo activo NO sea ya 'admin',
-- las dos ramas del WITH CHECK fallan siempre que el destino es 'admin':
--   - la primera rama lee el rol viejo (worker/employer, nunca admin);
--   - la segunda exige que el rol NUEVO esté en ('worker','employer'),
--     y 'admin' nunca lo está.
-- switchRoleAction('admin') queda rechazado por Postgres para TODA cuenta
-- que no esté ya en modo admin, sin importar si posee el permiso admin en
-- user_roles. Coincide exactamente con lo reportado: Admin -> Worker/
-- Employer funciona (ahí la primera rama sí lee 'admin', el valor viejo),
-- pero Worker/Employer -> Admin falla siempre.
--
-- CORRECCIÓN
-- Se agrega una tercera rama al WITH CHECK: permite el destino 'admin'
-- únicamente cuando existe una fila user_roles(user_id=auth.uid(),
-- role='admin', active=true) — la misma fuente de verdad de permisos que
-- ya usa switchRoleAction() a nivel de aplicación (y que changeUserRole()
-- en admin.ts ya mantiene sincronizada vía service role, 0016/0017). No se
-- relaja nada más: una cuenta sin esa fila (worker/employer normales)
-- sigue sin poder poner profiles.role='admin' bajo ninguna circunstancia,
-- ni siquiera con un UPDATE directo que se salte switchRoleAction() por
-- completo — la protección vive en la policy, no en la Server Action.
--
-- CÓMO EVITA LA AUTO-ESCALADA
-- La nueva rama depende de una fila en user_roles con role='admin'. Esa
-- fila NUNCA puede ser creada ni activada por el propio cliente
-- autenticado: user_roles_insert_own y user_roles_update_own
-- (0014_multi_role.sql) siguen intactas sin ningún cambio — insert_own
-- solo permite role in ('worker','employer'), y update_own solo permite
-- tocar la columna `active` con with check role in ('worker','employer').
-- La única forma de que exista una fila user_roles(role='admin') sigue
-- siendo el backfill de una migración o changeUserRole() vía
-- createAdminClient() (service role, ya protegido por assertAdmin() en
-- admin.ts) — ningún camino nuevo ni más débil se abre aquí.
--
-- ALCANCE
-- Solo se reemplaza el WITH CHECK de profiles_update_own. El USING queda
-- exactamente igual (auth.uid() = id or current_user_role() = 'admin').
-- No se modifica 0009 ni ninguna otra migración, ni las policies de
-- user_roles, ni el panel admin, ni OAuth/login/documentos.
-- ============================================================

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id or public.current_user_role() = 'admin')
  with check (
    public.current_user_role() = 'admin'
    or (auth.uid() = id and role in ('worker', 'employer'))
    or (
      auth.uid() = id
      and role = 'admin'
      and exists (
        select 1
        from public.user_roles
        where user_id = auth.uid()
          and role = 'admin'
          and active = true
      )
    )
  );
