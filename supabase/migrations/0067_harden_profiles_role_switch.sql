-- ============================================================
-- CHAMBY — SEC: el cambio de modo (profiles.role) exige poseer el rol
-- activo, y un usuario no puede insertarse un perfil con role='admin'
--
-- Hallazgo (auditoría de solo lectura, reproducido en un Postgres
-- desechable con los claims JWT de Supabase):
--   1. profiles_update_own (0047) deja a un usuario autenticado cambiar
--      DIRECTAMENTE su propio profiles.role a 'worker' o 'employer'
--      (PATCH /rest/v1/profiles) sin tener ese rol activo en user_roles.
--      La comprobación "¿posee el rol?" solo vive en la Server Action
--      switchRoleAction() (src/lib/actions/roles.ts); un cliente puede
--      saltársela. Casos: worker puro -> employer, employer puro ->
--      worker, y rol desactivado -> reactivado como modo.
--      No es una escalada de privilegios (worker/employer son de
--      auto-servicio: cualquiera puede insertarse esa fila en
--      user_roles), pero permite que el modo activo no corresponda a un
--      rol poseído en el momento del cambio, y de ese vínculo dependen
--      public_profiles (0061), public_workers (0066) y /employers/[id],
--      que filtran por user_roles.
--   2. profiles_insert_own (0001) solo exige auth.uid() = id y NO
--      restringe `role`: un usuario autenticado SIN fila en profiles
--      (estado que los flujos normales no producen —handle_new_user()
--      la crea siempre— pero que un borrado manual dejaría) podría
--      insertarse un perfil con role='admin' y obtener, vía
--      current_user_role(), privilegios de administrador.
--
-- Qué hace esta migración (solo reemplaza dos policies; USING no cambia):
--
--   A. profiles_update_own — la rama de auto-servicio worker/employer
--      ahora exige, además de lo que ya pedía (0047), UNA de dos cosas:
--        · que el rol NO cambie (edición normal de nombre, ciudad, bio...
--          sigue permitida aunque la cuenta tenga hoy un modo sin fila
--          activa: no se bloquea a nadie por un estado preexistente), o
--        · que exista user_roles(user_id = auth.uid(), role = nuevo rol,
--          active = true).
--      "El rol no cambia" se evalúa con una subconsulta plana contra la
--      misma tabla, que ve el valor PREVIO de role dentro del WITH CHECK
--      (mismo mecanismo ya documentado en 0018 y usado para is_active en
--      0047; sin SECURITY DEFINER, sin recursión: gobierna
--      profiles_select_own_or_admin).
--      Se mantienen SIN CAMBIOS:
--        · La rama de administrador (current_user_role() = 'admin'): es
--          la vía de changeUserRole() (admin.ts), que actualiza
--          profiles.role de OTRO usuario ANTES de crear/activar su fila
--          en user_roles con el cliente de servicio; exigirla ahí lo
--          rompería.
--        · La rama de auto-promoción a 'admin' (exige fila admin activa).
--        · La protección de is_active de 0047 en las dos ramas de
--          auto-servicio.
--
--   B. profiles_insert_own — se añade `role in ('worker','employer')`.
--      handle_new_user() es SECURITY DEFINER (owner postgres) y no pasa
--      por esta policy; ningún flujo de la app inserta en profiles.
--
-- LIMITACIÓN DE DISEÑO (conocida, NO resuelta por esta migración):
--   La policy valida la posesión del rol EN EL MOMENTO DEL CAMBIO DE
--   MODO (cuando profiles.role cambia). No garantiza por sí sola que el
--   modo activo siga correspondiendo a un rol activo si la fila de
--   user_roles se desactiva DESPUÉS: user_roles_update_own permite al
--   dueño poner active = false (0014; el trigger prevent_zero_active_roles
--   solo exige que quede al menos UN rol activo, no que sea el del modo
--   actual), y la cláusula "rol sin cambio" permite seguir editando el
--   perfil en ese estado. Es el mismo estado preexistente que ya podía
--   darse antes de esta migración. Cerrarlo exigiría otro mecanismo
--   (p. ej. un trigger que reasigne el modo al desactivar el rol, o que
--   los consumidores no confíen en profiles.role), con implicaciones
--   propias; queda como decisión pendiente y se registra en la prueba
--   (casos L1/L2). Por tanto, esta migración fija un invariante de
--   ORDEN/CONSISTENCIA en la transición, no un límite de autorización.
--
-- Compatibilidad con el código existente (sin cambios funcionales en src/):
--   · switchRoleAction(): ya comprueba la fila activa ANTES del UPDATE,
--     así que el orden de sus operaciones no cambia.
--   · enableEmployerRole() + switchRoleAction() (onboarding, "Publicar
--     chamba", RoleIndicator, UserMenu): la fila se inserta/activa antes
--     del UPDATE de profiles.role.
--   · updateProfile()/completeGoogleOnboarding() (ciudad, ubicación):
--     no cambian el rol -> permitido.
--   · changeUserRole()/toggleUserActive() (admin): rama admin intacta.
--
-- Requisito previo (verificado de solo lectura en producción): no hay
-- perfiles cuyo role no tenga fila activa en user_roles, ni usuarios de
-- auth sin perfil. Aun así, la cláusula "rol sin cambio" evita bloquear
-- ediciones si apareciera alguno.
--
-- Rollback: reaplicar profiles_update_own de 0047_harden_profiles_
-- is_active.sql y profiles_insert_own de 0001_init.sql.
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY.
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
      and (
        role = (select p.role from public.profiles p where p.id = auth.uid())
        or exists (
          select 1
          from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.role = profiles.role
            and ur.active = true
        )
      )
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

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (
    auth.uid() = id
    and role in ('worker', 'employer')
  );
