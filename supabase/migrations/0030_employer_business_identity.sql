-- ============================================================
-- CHAMBY — Identidad empresarial del empleador (Entrega 1)
--
-- Migración aditiva: agrega a `profiles` los campos de identidad de
-- negocio que un empleador puede declarar (tipo persona/empresa, nombre
-- comercial, rubro, descripción y RUC declarativo) más `district`,
-- reutilizado del mismo patrón que `worker_profile_details.district`
-- (0011) pero a nivel de `profiles` porque aquí no existe una tabla
-- 1:1 de detalles extendidos para employer — a diferencia del perfil
-- de trabajador, esta entrega no crea una tabla nueva para esto.
--
-- Todas las columnas nullable, sin default distinto de null: perfiles
-- existentes (worker o employer) no se ven afectados, y un empleador
-- que no completó su identidad de negocio simplemente no muestra esa
-- sección hasta que la complete.
--
-- IMPORTANTE — `business_ruc` es SOLO el RUC declarado por el propio
-- empleador (texto libre, sin validar contra SUNAT). NO es una fuente
-- de verificación: el único RUC verificado sigue siendo el que resulta
-- de `verification_documents` con `document_type='ruc' AND
-- status='verified'` (0010/0016), que ya alimenta el badge `ruc_active`
-- calculado en computeAndSaveProfileStats() (src/lib/actions/
-- profile.ts). Esta migración no toca esa tabla ni ese cálculo.
--
-- Sin cambios de RLS: `profiles_update_own` (0001_init.sql) ya cubre
-- cualquier columna nueva de `profiles` mientras `auth.uid() = id` —
-- no se necesita ninguna policy adicional, y estas columnas no alteran
-- en ningún caso el valor de `role` (protegido aparte, sin relación con
-- esta migración).
-- ============================================================

-- ------------------------------------------------------------
-- ENUM: tipo de empleador — mismo patrón que el resto del esquema
-- (user_role, job_status, document_type, document_rejection_reason,
-- etc.) usa enums nativos de Postgres para campos categóricos cerrados,
-- en vez de text + check.
-- ------------------------------------------------------------
do $$ begin
  create type public.employer_type as enum ('individual', 'company');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- profiles: identidad empresarial + distrito
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists employer_type        public.employer_type,
  add column if not exists business_name        text,
  add column if not exists business_sector      text,
  add column if not exists business_description text,
  add column if not exists business_ruc         text,
  add column if not exists district             text;
