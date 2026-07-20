-- ============================================================
-- CHAMBY - Datos de prueba (seed)
-- ============================================================
-- Ejecutar DESPUÉS de `supabase/migrations/0001_init.sql`.
--
-- Este script inserta usuarios directamente en `auth.users` (con
-- contraseña de prueba) para que el trigger `handle_new_user()`
-- cree automáticamente su fila en `public.profiles`. Luego se
-- completan campos adicionales (skills, bio, teléfono) con UPDATE.
--
-- Es idempotente: puedes ejecutarlo varias veces, al inicio borra
-- cualquier dato de prueba previo con los mismos IDs fijos.
--
-- Contraseña de todos los usuarios de prueba: Chamby2026!
--
-- IDs fijos usados (para que sea fácil rastrear relaciones):
--   Empleadores : 11111111-1111-1111-1111-111111111001..003
--   Trabajadores: 22222222-2222-2222-2222-222222222001..005
--   Jobs        : 33333333-3333-3333-3333-333333333001..006
--   Aplicaciones: 44444444-4444-4444-4444-444444444001..007
--   Ratings     : 55555555-5555-5555-5555-555555555001..004
-- ============================================================

create extension if not exists pgcrypto;

begin;

-- ------------------------------------------------------------
-- 0. LIMPIEZA (permite re-ejecutar el script sin duplicar datos)
-- ------------------------------------------------------------
delete from public.ratings
 where job_id in (
   '33333333-3333-3333-3333-333333333001','33333333-3333-3333-3333-333333333002',
   '33333333-3333-3333-3333-333333333003','33333333-3333-3333-3333-333333333004',
   '33333333-3333-3333-3333-333333333005','33333333-3333-3333-3333-333333333006'
 );

delete from public.job_applications
 where job_id in (
   '33333333-3333-3333-3333-333333333001','33333333-3333-3333-3333-333333333002',
   '33333333-3333-3333-3333-333333333003','33333333-3333-3333-3333-333333333004',
   '33333333-3333-3333-3333-333333333005','33333333-3333-3333-3333-333333333006'
 );

delete from public.jobs
 where id in (
   '33333333-3333-3333-3333-333333333001','33333333-3333-3333-3333-333333333002',
   '33333333-3333-3333-3333-333333333003','33333333-3333-3333-3333-333333333004',
   '33333333-3333-3333-3333-333333333005','33333333-3333-3333-3333-333333333006'
 );

delete from public.profiles
 where id in (
   '11111111-1111-1111-1111-111111111001','11111111-1111-1111-1111-111111111002',
   '11111111-1111-1111-1111-111111111003',
   '22222222-2222-2222-2222-222222222001','22222222-2222-2222-2222-222222222002',
   '22222222-2222-2222-2222-222222222003','22222222-2222-2222-2222-222222222004',
   '22222222-2222-2222-2222-222222222005'
 );

delete from auth.users
 where id in (
   '11111111-1111-1111-1111-111111111001','11111111-1111-1111-1111-111111111002',
   '11111111-1111-1111-1111-111111111003',
   '22222222-2222-2222-2222-222222222001','22222222-2222-2222-2222-222222222002',
   '22222222-2222-2222-2222-222222222003','22222222-2222-2222-2222-222222222004',
   '22222222-2222-2222-2222-222222222005'
 );

-- ------------------------------------------------------------
-- 1. USUARIOS (auth.users) → dispara handle_new_user() → crea profiles
-- ------------------------------------------------------------

-- 1.a Empleadores (3)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111001',
   'authenticated', 'authenticated', 'contacto@constructoraandina.pe',
   crypt('Chamby2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Constructora Andina SAC","role":"employer","city":"Lima"}',
   now() - interval '40 days', now() - interval '40 days', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111002',
   'authenticated', 'authenticated', 'rrhh@hogarfeliz.pe',
   crypt('Chamby2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Hogar Feliz Servicios","role":"employer","city":"Arequipa"}',
   now() - interval '35 days', now() - interval '35 days', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111003',
   'authenticated', 'authenticated', 'eventos@eventospro.pe',
   crypt('Chamby2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"EventosPro Perú","role":"employer","city":"Trujillo"}',
   now() - interval '30 days', now() - interval '30 days', '', '', '', '');

-- 1.b Trabajadores (5), con distintas habilidades
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222001',
   'authenticated', 'authenticated', 'juan.perez@chamby-demo.pe',
   crypt('Chamby2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Juan Pérez","role":"worker","city":"Lima","category":"Electricista"}',
   now() - interval '50 days', now() - interval '50 days', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222002',
   'authenticated', 'authenticated', 'maria.torres@chamby-demo.pe',
   crypt('Chamby2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"María Torres","role":"worker","city":"Lima","category":"Niñera"}',
   now() - interval '48 days', now() - interval '48 days', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222003',
   'authenticated', 'authenticated', 'carlos.ramirez@chamby-demo.pe',
   crypt('Chamby2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Carlos Ramírez","role":"worker","city":"Arequipa","category":"Albañil"}',
   now() - interval '45 days', now() - interval '45 days', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222004',
   'authenticated', 'authenticated', 'lucia.fernandez@chamby-demo.pe',
   crypt('Chamby2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Lucía Fernández","role":"worker","city":"Trujillo","category":"Cocinera"}',
   now() - interval '42 days', now() - interval '42 days', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222005',
   'authenticated', 'authenticated', 'pedro.quispe@chamby-demo.pe',
   crypt('Chamby2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Pedro Quispe","role":"worker","city":"Arequipa","category":"Gasfitero"}',
   now() - interval '38 days', now() - interval '38 days', '', '', '', '');

-- 1.c Completar datos de perfil que el trigger no cubre
-- (skills, bio, teléfono) — el trigger ya creó full_name/role/city/category

update public.profiles set
  bio = 'Empresa constructora con 12 años de experiencia en proyectos residenciales y comerciales en Lima y Arequipa.',
  phone = '+51 987 111 001'
where id = '11111111-1111-1111-1111-111111111001';

update public.profiles set
  bio = 'Agencia de servicios del hogar: niñeras, personal de limpieza y cuidado de adultos mayores.',
  phone = '+51 987 111 002'
where id = '11111111-1111-1111-1111-111111111002';

update public.profiles set
  bio = 'Organizamos eventos corporativos y sociales en la región norte del Perú.',
  phone = '+51 987 111 003'
where id = '11111111-1111-1111-1111-111111111003';

update public.profiles set
  skills = array['instalaciones eléctricas', 'mantenimiento industrial', 'tableros eléctricos'],
  bio = 'Electricista certificado con 8 años de experiencia en obras residenciales e industriales.',
  phone = '+51 987 222 001'
where id = '22222222-2222-2222-2222-222222222001';

update public.profiles set
  skills = array['cuidado infantil', 'primeros auxilios', 'apoyo escolar'],
  bio = 'Niñera con certificación en primeros auxilios pediátricos, 5 años de experiencia.',
  phone = '+51 987 222 002'
where id = '22222222-2222-2222-2222-222222222002';

update public.profiles set
  skills = array['albañilería', 'tarrajeo', 'construcción de cercos'],
  bio = 'Maestro de obra con experiencia en construcción y remodelación de viviendas.',
  phone = '+51 987 222 003'
where id = '22222222-2222-2222-2222-222222222003';

update public.profiles set
  skills = array['cocina criolla', 'banquetes', 'repostería'],
  bio = 'Cocinera profesional especializada en eventos y banquetes para hasta 200 personas.',
  phone = '+51 987 222 004'
where id = '22222222-2222-2222-2222-222222222004';

update public.profiles set
  skills = array['gasfitería', 'instalaciones sanitarias', 'reparación de fugas'],
  bio = 'Gasfitero con 10 años de experiencia en instalaciones y reparaciones urgentes.',
  phone = '+51 987 222 005'
where id = '22222222-2222-2222-2222-222222222005';

-- ------------------------------------------------------------
-- 2. TRABAJOS (jobs) en distintas ciudades y estados
-- ------------------------------------------------------------

insert into public.jobs (
  id, employer_id, title, description, category, city, address,
  pay_amount, pay_type, status, positions_needed, assigned_worker_id,
  starts_at, created_at
) values
  -- 1) Abierto, sin asignar
  ('33333333-3333-3333-3333-333333333001',
   '11111111-1111-1111-1111-111111111001',
   'Electricista para obra en San Isidro',
   'Se busca electricista con experiencia en instalaciones residenciales para obra en San Isidro. Trabajo de 3 semanas.',
   'Electricista', 'Lima', 'Av. Los Incas 450, San Isidro',
   150.00, 'por_dia', 'abierto', 1, null,
   current_date + 5, now() - interval '6 days'),

  -- 2) Completado y calificado (María)
  ('33333333-3333-3333-3333-333333333002',
   '11111111-1111-1111-1111-111111111002',
   'Niñera de medio tiempo',
   'Cuidado de dos niños (5 y 8 años) en las tardes, lunes a viernes, de 2pm a 7pm.',
   'Niñera', 'Lima', 'Calle Las Camelias 210, Miraflores',
   25.00, 'por_hora', 'completado', 1, '22222222-2222-2222-2222-222222222002',
   now() - interval '25 days', now() - interval '28 days'),

  -- 3) Completado y calificado (Carlos)
  ('33333333-3333-3333-3333-333333333003',
   '11111111-1111-1111-1111-111111111001',
   'Albañil para remodelación de fachada',
   'Remodelación de fachada de casa de dos pisos, incluye tarrajeo y pintura de exteriores.',
   'Albañil', 'Arequipa', 'Calle Mercaderes 320, Cercado',
   1200.00, 'fijo', 'completado', 1, '22222222-2222-2222-2222-222222222003',
   now() - interval '20 days', now() - interval '24 days'),

  -- 4) Abierto, sin asignar
  ('33333333-3333-3333-3333-333333333004',
   '11111111-1111-1111-1111-111111111003',
   'Cocinera para evento corporativo',
   'Preparación de banquete para 120 personas en evento de fin de año de empresa.',
   'Cocinera', 'Trujillo', 'Av. España 1500, Trujillo',
   400.00, 'fijo', 'abierto', 2, null,
   current_date + 12, now() - interval '3 days'),

  -- 5) En progreso (Pedro asignado, aún sin calificar porque no ha finalizado)
  ('33333333-3333-3333-3333-333333333005',
   '11111111-1111-1111-1111-111111111002',
   'Gasfitero urgente por fuga de agua',
   'Reparación urgente de fuga de agua en tubería principal de vivienda.',
   'Gasfitero', 'Arequipa', 'Urb. Cayma 88, Cayma',
   180.00, 'fijo', 'en_progreso', 1, '22222222-2222-2222-2222-222222222005',
   current_date - 1, now() - interval '4 days'),

  -- 6) Completado y calificado (Carlos, segundo trabajo → prueba de promedio en la vista)
  ('33333333-3333-3333-3333-333333333006',
   '11111111-1111-1111-1111-111111111003',
   'Construcción de cerco perimétrico',
   'Construcción de cerco perimétrico de 40 metros lineales para local comercial.',
   'Albañil', 'Trujillo', 'Av. Larco 900, Trujillo',
   2200.00, 'fijo', 'completado', 1, '22222222-2222-2222-2222-222222222003',
   now() - interval '15 days', now() - interval '19 days');

-- ------------------------------------------------------------
-- 3. POSTULACIONES (job_applications)
-- ------------------------------------------------------------

insert into public.job_applications (id, job_id, worker_id, status, message, created_at) values
  -- Postulación pendiente al job abierto de electricista
  ('44444444-4444-4444-4444-444444444001',
   '33333333-3333-3333-3333-333333333001',
   '22222222-2222-2222-2222-222222222001',
   'pendiente',
   'Tengo disponibilidad inmediata y experiencia en instalaciones similares.',
   now() - interval '5 days'),

  -- Postulación aceptada → niñera (María)
  ('44444444-4444-4444-4444-444444444002',
   '33333333-3333-3333-3333-333333333002',
   '22222222-2222-2222-2222-222222222002',
   'aceptado',
   'Cuento con certificación en primeros auxilios pediátricos.',
   now() - interval '27 days'),

  -- Postulación rechazada de Lucía al mismo job de niñera (aplicó pero fue María la elegida)
  ('44444444-4444-4444-4444-444444444003',
   '33333333-3333-3333-3333-333333333002',
   '22222222-2222-2222-2222-222222222004',
   'rechazado',
   'Tengo experiencia cuidando a mis sobrinos y disponibilidad completa.',
   now() - interval '27 days'),

  -- Postulación aceptada → albañil (Carlos), job 3
  ('44444444-4444-4444-4444-444444444004',
   '33333333-3333-3333-3333-333333333003',
   '22222222-2222-2222-2222-222222222003',
   'aceptado',
   'He trabajado en varios proyectos de remodelación de fachadas en Arequipa.',
   now() - interval '23 days'),

  -- Postulación pendiente → cocinera, job 4
  ('44444444-4444-4444-4444-444444444005',
   '33333333-3333-3333-3333-333333333004',
   '22222222-2222-2222-2222-222222222004',
   'pendiente',
   'Tengo experiencia preparando banquetes para más de 100 personas.',
   now() - interval '2 days'),

  -- Postulación aceptada → gasfitero, job 5
  ('44444444-4444-4444-4444-444444444006',
   '33333333-3333-3333-3333-333333333005',
   '22222222-2222-2222-2222-222222222005',
   'aceptado',
   'Puedo llegar en menos de una hora, tengo las herramientas necesarias.',
   now() - interval '4 days'),

  -- Postulación aceptada → albañil (Carlos), job 6
  ('44444444-4444-4444-4444-444444444007',
   '33333333-3333-3333-3333-333333333006',
   '22222222-2222-2222-2222-222222222003',
   'aceptado',
   'Disponible para viajar a Trujillo por el tiempo que dure el proyecto.',
   now() - interval '18 days');

-- ------------------------------------------------------------
-- 4. CALIFICACIONES (ratings) — solo en trabajos completados
-- ------------------------------------------------------------
-- Diseñadas para probar la vista `rating_summary`:
--   - María Torres      → 1 calificación   (promedio = 5.0)
--   - Hogar Feliz       → 1 calificación   (promedio = 5.0)
--   - Carlos Ramírez    → 2 calificaciones (4.0 y 5.0 → promedio = 4.5)

insert into public.ratings (id, job_id, rater_id, rated_id, score, comment, created_at) values
  -- Job 2 (niñera): el empleador califica a María
  ('55555555-5555-5555-5555-555555555001',
   '33333333-3333-3333-3333-333333333002',
   '11111111-1111-1111-1111-111111111002',
   '22222222-2222-2222-2222-222222222002',
   5, 'Excelente trato con los niños, muy puntual y responsable.',
   now() - interval '24 days'),

  -- Job 2 (niñera): María califica al empleador
  ('55555555-5555-5555-5555-555555555002',
   '33333333-3333-3333-3333-333333333002',
   '22222222-2222-2222-2222-222222222002',
   '11111111-1111-1111-1111-111111111002',
   5, 'Muy buen trato y pago puntual, ambiente familiar agradable.',
   now() - interval '24 days'),

  -- Job 3 (albañil): el empleador califica a Carlos (primera calificación)
  ('55555555-5555-5555-5555-555555555003',
   '33333333-3333-3333-3333-333333333003',
   '11111111-1111-1111-1111-111111111001',
   '22222222-2222-2222-2222-222222222003',
   4, 'Buen trabajo, cumplió el plazo aunque con algunas observaciones menores en el acabado.',
   now() - interval '20 days'),

  -- Job 6 (albañil): el empleador califica a Carlos (segunda calificación → promedio 4.5)
  ('55555555-5555-5555-5555-555555555004',
   '33333333-3333-3333-3333-333333333006',
   '11111111-1111-1111-1111-111111111003',
   '22222222-2222-2222-2222-222222222003',
   5, 'Trabajo impecable, terminó antes de lo previsto. Totalmente recomendado.',
   now() - interval '14 days');

commit;

-- ------------------------------------------------------------
-- 5. VERIFICACIÓN RÁPIDA
-- ------------------------------------------------------------
-- Ejecuta esto para confirmar que la vista agrega correctamente:
--
-- select p.full_name, p.role, rs.average_score, rs.total_ratings
-- from public.rating_summary rs
-- join public.profiles p on p.id = rs.profile_id
-- order by rs.average_score desc;
--
-- Resultado esperado:
--   Carlos Ramírez        | worker   | 4.50 | 2
--   María Torres          | worker   | 5.00 | 1
--   Hogar Feliz Servicios | employer | 5.00 | 1
--
-- Inicio de sesión de prueba (todos los usuarios):
--   Contraseña: Chamby2026!
--   Empleadores: contacto@constructoraandina.pe · rrhh@hogarfeliz.pe · eventos@eventospro.pe
--   Trabajadores: juan.perez@chamby-demo.pe · maria.torres@chamby-demo.pe ·
--                 carlos.ramirez@chamby-demo.pe · lucia.fernandez@chamby-demo.pe ·
--                 pedro.quispe@chamby-demo.pe
