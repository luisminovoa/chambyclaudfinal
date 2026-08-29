-- ============================================================
-- CHAMBY — Fase 1: ubicación jerárquica (departamento → provincia →
-- distrito) para reemplazar "ciudad + distrito libre".
--
-- Migración exclusivamente aditiva: NO elimina `city` ni `profiles.district`
-- ni `worker_profile_details.district`, no cambia su tipo ni su
-- nullability. `city` sigue siendo la fuente de verdad hasta que el
-- usuario vuelva a guardar su perfil/trabajo con el nuevo
-- LocationSelector — ningún registro existente deja de mostrarse.
--
-- Nuevas columnas (todas nullable, sin default):
--   profiles.department, profiles.province
--   jobs.department, jobs.province, jobs.district (jobs no tenía distrito)
--
-- profiles.district se reutiliza como el distrito ESTRUCTURADO a partir
-- de ahora — no se agrega una columna paralela para no duplicar
-- semántica. Esto aplica tanto a worker como a employer: ambos comparten
-- profiles.city/district hoy, así que ambos comparten
-- profiles.department/province/district de aquí en adelante (ver
-- LocationSelector en InfoTab.tsx y EmployerInfoTab.tsx).
--
-- worker_profile_details.district (el campo libre que ya existía SOLO
-- para el trabajador, separado de profiles.district) queda
-- deliberadamente SIN TOCAR y sin nueva columna: su valor histórico
-- permanece intacto, pero InfoTab.tsx deja de escribirlo — la ubicación
-- estructurada del trabajador vive ahora en profiles, igual que la del
-- empleador, para no tener dos representaciones de "distrito" compitiendo
-- entre sí.
--
-- El código de aplicación (Server Actions, ver src/lib/ubigeo.ts) es
-- quien exige, desde este punto en adelante, que un valor nuevo de
-- district venga acompañado de department/province válidos y
-- pertenecientes entre sí.
--
-- Backfill: SOLO se completa department/province para los dos únicos
-- valores de `city` con mapeo inequívoco documentado en
-- src/lib/cities.ts (auditoría real de Production, Fase C4-B/C):
--   "Chiclayo" (cualquier variante de mayúsculas/espacios) → Lambayeque / Chiclayo
--   "Trujillo" (cualquier variante de mayúsculas/espacios) → La Libertad / Trujillo
-- Cualquier otro valor histórico de `city` (o su ausencia) deja
-- department/province en NULL deliberadamente — no hay forma segura de
-- inferir departamento/provincia a partir de una ciudad arbitraria sin
-- arriesgar una asignación incorrecta. No se backfillea `district`: el
-- valor libre existente (si lo hay) no puede validarse contra el
-- catálogo Ubigeo sin intervención del usuario.
-- ============================================================

alter table public.profiles
  add column if not exists department text,
  add column if not exists province text;

alter table public.jobs
  add column if not exists department text,
  add column if not exists province text,
  add column if not exists district text;

-- Backfill profiles (worker y employer comparten profiles.city).
update public.profiles
set department = 'Lambayeque', province = 'Chiclayo'
where department is null
  and province is null
  and trim(lower(city)) = 'chiclayo';

update public.profiles
set department = 'La Libertad', province = 'Trujillo'
where department is null
  and province is null
  and trim(lower(city)) = 'trujillo';

-- Backfill jobs (mismo criterio conservador: solo los dos valores de
-- ciudad con mapeo inequívoco conocido).
update public.jobs
set department = 'Lambayeque', province = 'Chiclayo'
where department is null
  and province is null
  and trim(lower(city)) = 'chiclayo';

update public.jobs
set department = 'La Libertad', province = 'Trujillo'
where department is null
  and province is null
  and trim(lower(city)) = 'trujillo';
