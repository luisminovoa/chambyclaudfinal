-- ============================================================
-- CHAMBY — public_workers: proyección pública de solo lectura para el
-- directorio de trabajadores (fuente de datos, sin UI todavía)
--
-- Objetivo: el Home actualmente enlaza cada categoría a
-- /jobs?category=... para cualquier actor, incluido un empleador —
-- correcto para trabajador/visitante, incorrecto para empleador (que
-- necesita ENCONTRAR trabajadores, no trabajos). Esta migración prepara
-- únicamente la fuente de datos segura; la ruta /workers, el
-- condicional de rol en page.tsx y cualquier UI quedan fuera de alcance
-- de este PR — ver auditoría previa (informe "DISEÑO DEL DIRECTORIO DE
-- TRABAJADORES PARA EMPLEADORES").
--
-- Por qué una vista nueva y no reutilizar public.public_profiles
-- (0034_harden_profiles_public_access.sql): public_profiles mezcla
-- workers y employers (columnas employer_type/business_name/
-- business_sector/business_description son ruido para un directorio de
-- trabajadores) y no filtra por role='worker'. Además, ninguna de las
-- columnas que un directorio de trabajadores necesita
-- (professional_title, availability, years_experience, hourly_rate,
-- daily_rate) vive en profiles — viven en worker_profile_details
-- (0011_worker_profile_details.sql), una tabla distinta. Modificar
-- public_profiles para agregarle ese JOIN expondría esas columnas
-- también a quien la consulta con fines de empleador — mezclar
-- audiencias en una sola vista es justo lo que 0034/0035/0036 evitaron.
--
-- worker_profile_details está protegida por RLS owner+admin-only
-- (0011_worker_profile_details.sql: "worker_details_select_own",
-- using (auth.uid() = profile_id or current_user_role() = 'admin')) —
-- esta migración NO la modifica, NO la amplía, NO toca ninguna de sus
-- policies. En vez de eso, esta vista actúa con permisos de propietario
-- (sin security_invoker) para proyectar SOLO las columnas seguras de
-- ambas tablas, exactamente el mismo patrón ya usado por
-- public_profiles: si la vista heredara la RLS restrictiva de
-- profiles/worker_profile_details (security_invoker = true), un
-- empleador sin relación previa con el trabajador recibiría 0 filas
-- para cualquier trabajador de un tercero — ya validado empíricamente
-- en esta misma iniciativa para public_profiles, mismo razonamiento
-- aplica aquí sin necesidad de repetir el experimento.
--
-- worker_profile_details también contiene columnas genuinamente
-- sensibles (whatsapp, birth_date, address, district) que esta vista
-- EXCLUYE deliberadamente — nunca deben aparecer en un directorio.
-- hourly_rate/daily_rate SÍ se incluyen: ya se muestran hoy en el
-- perfil de trabajador (WorkerPublicProfileView) para cualquier
-- empleador con una relación de postulación legítima — esta vista no
-- amplía qué información existe, solo prepara el canal para mostrarla
-- a un empleador sin esa relación previa (decisión de UI/autorización
-- de "Ver perfil" pendiente, fuera de este PR).
--
-- profiles.category y worker_profile_details.professional_title son
-- texto libre, sin catálogo normalizado (auditado: RegisterForm.tsx usa
-- un <input> libre, InfoTab.tsx usa un <select> con una lista propia
-- distinta de src/lib/categories.ts). Esta vista expone el valor tal
-- cual existe — NO intenta normalizar ni mapear variantes; el filtrado
-- inteligente por categoría es responsabilidad de una capa posterior,
-- fuera de este PR.
--
-- Solo perfiles de trabajadores activos: role = 'worker' AND is_active.
-- Admins y employers nunca aparecen aquí bajo ninguna circunstancia.
-- ============================================================

drop view if exists public.public_workers;
create view public.public_workers as
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
    d.daily_rate
  from public.profiles p
  left join public.worker_profile_details d on d.profile_id = p.id
  where p.is_active and p.role = 'worker';

comment on view public.public_workers is
  'Proyección pública de solo lectura para el directorio de trabajadores (fuente de datos — sin UI todavía). Combina profiles + worker_profile_details, solo columnas seguras: nunca expone phone, business_ruc, whatsapp, birth_date, address, district ni ningún documento de verificación. Excluye admins, employers y trabajadores inactivos. No usar profiles ni worker_profile_details directamente para leer el perfil de un tercero sin relación establecida.';

-- ------------------------------------------------------------
-- Grants: SOLO LECTURA, y SOLO para authenticated en esta primera
-- versión (caso de uso: empleador ya autenticado buscando a quién
-- contratar, no un directorio público anónimo — a diferencia de
-- public_profiles, que sí es visible para anon). REVOKE explícito
-- primero, igual patrón que 0036_harden_public_profiles_grants.sql,
-- para no depender de qué haya heredado esta vista nueva del
-- aprovisionamiento por defecto de Supabase sobre el esquema public.
-- ------------------------------------------------------------
revoke all on public.public_workers from public;
revoke all on public.public_workers from anon;
revoke all on public.public_workers from authenticated;
revoke all on public.public_workers from service_role;

grant select on public.public_workers to authenticated;
