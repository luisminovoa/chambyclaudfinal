-- ============================================================
-- CHAMBY — SEC: public_workers solo para empleadores/admin, y solo
-- trabajadores con rol worker activo
--
-- Hallazgo (auditoría de solo lectura, verificado en producción):
--   public.public_workers (0037/0042) es una vista definer con SELECT para
--   `authenticated`. Como el registro es abierto, CUALQUIER cuenta —también
--   un trabajador cualquiera— podía listar a todos los trabajadores activos
--   (nombre, localidad, oficio, bio, skills, tarifas, fecha de alta), aunque
--   la aplicación solo ofrece el directorio a empleadores: el enlace
--   "Buscar trabajadores" solo está en la navegación de employer, Home
--   carga "Trabajadores recomendados" solo para employer, y abrir el perfil
--   individual ya exige ser empleador, admin o tener relación (canViewWorkerProfile).
--   Además la vista filtraba por profiles.role (modo activo, que el propio
--   usuario puede cambiar: profiles_update_own, 0018), no por user_roles.
--
-- Esta migración SOLO cambia el WHERE de la vista (CREATE OR REPLACE VIEW
-- con las mismas 16 columnas, mismo orden, nombres y tipos que 0042 — si
-- alguno cambiara, Postgres rechazaría el reemplazo con 42P16):
--
--   1. Quien consulta debe tener un rol ACTIVO en user_roles:
--        role in ('employer', 'admin') AND active
--      Se decide contra user_roles (roles POSEÍDOS), no contra profiles.role
--      (modo activo): un usuario worker+employer ve el directorio sin
--      importar en qué modo esté. Es la misma regla que usa 0061 para
--      public_profiles.
--      auth.uid() se evalúa DENTRO de la vista definer sin problema: lee los
--      GUC de la sesión de quien consulta (request.jwt.claim.sub), no del
--      owner; es el mismo auth.uid() que ya usan check_message_rate_limit()
--      (0045) y current_user_role() (0001), ambas definer. Sin sesión
--      (auth.uid() NULL) no se devuelve ninguna fila. Es un subselect no
--      correlacionado: el planificador lo evalúa UNA vez (InitPlan) y, si
--      falla, ni siquiera recorre profiles.
--
--   2. La fila mostrada debe seguir siendo un trabajador activo:
--        profiles.is_active AND profiles.role = 'worker'      (sin cambios)
--      y, además (defensa preventiva), poseer un rol worker ACTIVO en
--      user_roles. Hoy producción tiene 0 casos (4 de 4 perfiles worker
--      activos tienen el rol), pero profiles.role es modificable por el
--      propio usuario sin pasar por user_roles: un empleador podría ponerse
--      role='worker' y aparecer en el directorio, o un trabajador con el rol
--      worker desactivado seguiría apareciendo. Es un subconjunto estricto
--      del criterio anterior: no agrega ninguna fila nueva.
--
-- NO cambia:
--   · Columnas, tipos, orden, owner (postgres), SECURITY DEFINER (sin
--     security_invoker) ni comportamiento de las columnas.
--   · Grants: se conservan tal cual (SELECT solo para `authenticated`;
--     `anon`, `service_role` y PUBLIC siguen sin acceso). CREATE OR REPLACE
--     VIEW conserva owner y ACL; no se emite ningún GRANT/REVOKE.
--   · RLS/policies de profiles, worker_profile_details o user_roles, ni
--     rating_summary, ratings, funciones o código de aplicación.
--   · El COMMENT ON VIEW de 0042 (sigue siendo cierto: excluye admins,
--     employers y trabajadores inactivos; nunca expone phone, business_ruc,
--     whatsapp, birth_date, address ni documentos).
--
-- Efecto en la aplicación:
--   · Empleadores y admin: sin cambios (/workers, Home, calendario).
--   · Un trabajador puro que abra /workers verá una lista vacía (no tiene
--     enlace; antes veía el directorio completo).
--   · getMyCalendar() resuelve nombres de trabajadores asignados a trabajos
--     de un EMPLEADOR: ese usuario tiene employer activo, así que no cambia.
--
-- Requisito previo (verificar en producción antes de aplicar): todo admin
-- debe tener user_roles(role='admin', active=true) — 0014 lo rellena desde
-- profiles y 0018/0061 ya dependen de ello. Un admin sin esa fila perdería
-- el directorio.
--
-- Rollback: CREATE OR REPLACE VIEW con la definición de
-- 0042_public_workers_hierarchical_location.sql (WHERE p.is_active and
-- p.role = 'worker').
--
-- Idempotente: CREATE OR REPLACE VIEW se puede aplicar más de una vez.
-- ============================================================

create or replace view public.public_workers as
  select
    p.id,
    p.full_name,
    p.avatar_url,
    p.city,
    p.category,
    p.skills,
    p.bio,
    p.created_at,
    d.professional_title,
    d.availability,
    d.years_experience,
    d.hourly_rate,
    d.daily_rate,
    p.department,
    p.province,
    p.district
  from public.profiles p
  left join public.worker_profile_details d on d.profile_id = p.id
  where p.is_active
    and p.role = 'worker'
    and exists (
      select 1
      from public.user_roles w
      where w.user_id = p.id
        and w.role = 'worker'
        and w.active
    )
    and exists (
      select 1
      from public.user_roles v
      where v.user_id = auth.uid()
        and v.role in ('employer', 'admin')
        and v.active
    );
