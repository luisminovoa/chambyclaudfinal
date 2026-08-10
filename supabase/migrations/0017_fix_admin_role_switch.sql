-- ============================================================
-- CHAMBY — Corrige "no puedo volver a Administrador tras cambiar de rol"
--
-- CAUSA RAÍZ
-- switchRoleAction() (src/lib/actions/roles.ts) exige una fila ACTIVA en
-- user_roles para el rol destino antes de dejar cambiar profiles.role.
-- user_roles nunca llegaba a tener una fila role='admin' para cuentas
-- promovidas después del backfill inicial de 0014_multi_role.sql:
-- changeUserRole() (src/lib/actions/admin.ts) solo escribía
-- profiles.role, nunca user_roles. En cuanto esa cuenta cambiaba a
-- Trabajador/Empleador (lo que sí funciona, porque esa fila existe desde
-- el signup vía handle_new_user()), no quedaba ningún camino de vuelta:
-- switchRoleAction('admin') encontraba 0 filas activas con role='admin'
-- y rechazaba el cambio de forma permanente.
--
-- QUÉ NO CAMBIA
-- Las policies user_roles_insert_own / user_roles_update_own de 0014
-- (que restringen a `authenticated` a solo poder insertar/activar
-- 'worker'/'employer', nunca 'admin' — cierre de V4) NO se tocan aquí:
-- siguen siendo la defensa contra que un usuario se autoasigne admin.
-- La otra mitad de esta corrección vive en código: changeUserRole()
-- ahora también escribe/desactiva la fila role='admin' en user_roles
-- usando createAdminClient() (service role, sí puede saltarse esas
-- policies), acción que ya está protegida por assertAdmin() — el cliente
-- autenticado normal sigue sin poder tocar esa fila directamente.
--
-- QUÉ HACE ESTA MIGRACIÓN
-- Backfill idempotente: toda cuenta que HOY tiene profiles.role='admin'
-- obtiene (o reactiva) su fila en user_roles, igual que el backfill
-- original de 0014 pero re-ejecutable sin duplicar filas
-- (unique (user_id, role) + on conflict).
--
-- LÍMITE CONOCIDO: esto solo repara cuentas que en este momento SIGUEN
-- en modo admin. La cuenta específica que ya quedó atascada en modo
-- Trabajador/Empleador por este bug (profiles.role ya no dice 'admin')
-- no puede recuperarse solo con datos — no hay ningún otro registro que
-- diga "esta cuenta fue admin alguna vez". Requiere una reparación manual
-- puntual (profiles.role = 'admin' para esa cuenta), después de la cual
-- esta misma migración (re-ejecutada, es idempotente) le crea la fila en
-- user_roles automáticamente.
-- ============================================================

insert into public.user_roles (user_id, role, active)
select id, 'admin'::user_role, true
from public.profiles
where role = 'admin'
on conflict (user_id, role) do update set active = true;
