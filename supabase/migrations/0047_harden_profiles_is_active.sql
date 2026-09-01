-- ============================================================
-- CHAMBY — Hallazgo residual documentado en docs/SECURITY_AUDIT_v0.8.md
-- §5 ("Riesgos residuales"): autorreactivación de is_active.
--
-- profiles_update_own (0018_fix_admin_role_switch_rls.sql, vigente sin
-- cambios desde entonces) tiene un WITH CHECK que restringe qué valores
-- de `role` puede escribir el propio dueño de la fila, pero nunca
-- restringió `is_active` en absoluto. Un usuario suspendido por un
-- admin (is_active=false, mecanismo real: toggleUserActive() en
-- src/lib/actions/admin.ts, moderación vía docs/user-reporting-
-- moderation-design.md) podía ejecutar directamente
-- `update profiles set is_active = true where id = auth.uid()` — vía
-- PostgREST/supabase-js, sin pasar por ninguna Server Action — y
-- levantar su propia suspensión sin ninguna intervención de
-- administración. Verificado empíricamente que esto era posible contra
-- la policy exacta y vigente de main antes de esta migración.
--
-- src/lib/actions/profile.ts (updateProfile()) nunca expuso is_active
-- en su allowlist — eso ya impedía el camino "oficial" de la app, pero
-- NO cierra el hallazgo: la protección debe existir en RLS, no
-- solamente en la Server Action, porque un cliente puede saltarse
-- Next.js por completo y llamar a PostgREST/supabase-js directamente
-- (mismo modelo de atacante ya usado en V1/V2/V3, docs/SECURITY_AUDIT_
-- v0.7.md/v0.8.md: "cliente autenticado con acceso directo a
-- supabase.from(...).update(...) desde la consola del navegador").
--
-- FIX: se añade, únicamente a las dos ramas de auto-servicio del WITH
-- CHECK (el propio dueño cambiando su rol entre worker/employer, y el
-- propio dueño auto-promoviéndose a modo admin vía una fila legítima en
-- user_roles), la condición de que `is_active` en la fila NUEVA debe
-- coincidir exactamente con el valor YA ALMACENADO de esa misma fila.
--
-- CÓMO SE OBTIENE EL VALOR "YA ALMACENADO" DENTRO DE WITH CHECK: se usa
-- una subconsulta plana (sin SECURITY DEFINER) contra la misma tabla,
-- filtrada por id = auth.uid() — exactamente el mismo mecanismo que
-- current_user_role() (0001_init.sql) ya explota para ver el valor
-- PREVIO de `role` en este mismo WITH CHECK (documentado explícitamente
-- en el comentario de 0018: "esa subconsulta ve el valor PREVIO de
-- profiles.role — Postgres no expone el propio cambio, a mitad de
-- sentencia, a una subconsulta separada sobre la misma tabla"). No se
-- crea ninguna función SECURITY DEFINER nueva: se verificó
-- empíricamente contra un Postgres 16 desechable que una subconsulta
-- plana (sin SECURITY DEFINER) exhibe exactamente el mismo
-- comportamiento — ve el valor pre-statement, no el que la propia
-- sentencia está intentando escribir — así que no hace falta reproducir
-- el patrón SECURITY DEFINER de current_user_role() solo para esto. La
-- subconsulta es una simple SELECT sobre profiles, gobernada por
-- profiles_select_own_or_admin (no por profiles_update_own), así que no
-- hay riesgo de recursión de policy.
--
-- LA RAMA ADMIN (current_user_role() = 'admin', primera rama del WITH
-- CHECK) NO SE TOCA: es la vía real por la que toggleUserActive()
-- (admin.ts) suspende/reactiva a OTROS usuarios hoy — usa el cliente de
-- sesión del propio admin (no createAdminClient()), así que depende
-- 100% de que esta rama siga permitiendo cualquier cambio cuando quien
-- ejecuta el UPDATE es realmente un admin. Verificado empíricamente que
-- el flujo admin-suspende/admin-reactiva sigue funcionando sin cambios
-- tras esta migración.
--
-- Efecto colateral esperado y correcto (no es una regresión): un
-- usuario ACTIVO tampoco puede auto-suspenderse (is_active true→false)
-- por la misma vía directa, ya que la condición exige igualdad con el
-- valor previo en ambas direcciones. No existe ningún flujo legítimo de
-- la aplicación que dependa de que un usuario normal cambie su propio
-- is_active — es una restricción puramente de endurecimiento.
--
-- ALCANCE: se reemplaza únicamente profiles_update_own. El USING queda
-- exactamente igual (auth.uid() = id or current_user_role() = 'admin').
-- No se modifica 0001, 0009, 0014, 0018 (migración histórica, no
-- editada) ni ninguna otra policy de profiles/user_roles/jobs/messages.
-- No se toca role, current_user_role(), switchRoleAction(),
-- enableEmployerRole(), SEC-002 (profiles_select_*), 0045 ni 0046.
-- ============================================================

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
    or (
      auth.uid() = id
      and role = 'admin'
      and is_active = (select p.is_active from public.profiles p where p.id = auth.uid())
      and exists (
        select 1
        from public.user_roles
        where user_id = auth.uid()
          and role = 'admin'
          and active = true
      )
    )
  );
