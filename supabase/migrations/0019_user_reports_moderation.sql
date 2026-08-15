-- ============================================================
-- CHAMBY — Sistema de reportes de usuario / moderación (Fase 1)
--
-- Diseño completo en docs/user-reporting-moderation-design.md.
-- Sistema independiente de bug_reports (0005_beta.sql) — bug_reports
-- sigue siendo exclusivamente para errores técnicos de la app, no se
-- toca en esta migración.
--
-- Esta migración cubre: enums, tabla `reports`, tabla `report_evidence`,
-- RLS de ambas, la vista `reporter_reports_view` (para que el
-- denunciante pueda leer el estado de su propio reporte sin exponer
-- `admin_notes`/`reviewed_by` — RLS de Postgres no puede redactar
-- columnas dentro de una fila que el dueño ya puede leer, ver §6.3 del
-- documento de diseño) y el bucket privado de Storage para evidencia.
--
-- moderation_actions (tabla de auditoría) va en 0020, migración
-- separada a propósito (revisable/testeable de forma independiente).
-- ============================================================

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------
do $$ begin
  create type public.report_target_type as enum ('user', 'job');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_reason as enum (
    'scam_fraud',
    'inappropriate_behavior',
    'non_compliance',
    'harassment',
    'suspicious_request',
    'payment_issue',
    'no_show',
    'false_information',
    'inappropriate_content',
    'suspicious_terms',
    'discrimination',
    'spam',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum ('pending', 'under_review', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- TABLA: reports
-- ------------------------------------------------------------
create table if not exists public.reports (
  id                uuid primary key default gen_random_uuid(),

  -- Quién reporta — siempre auth.uid() server-side, nunca un valor
  -- enviado por el cliente (ver Server Actions en src/lib/actions/
  -- reports.ts). Reforzado también por RLS (reports_insert_own, abajo).
  reporter_id       uuid not null references public.profiles(id) on delete cascade,

  -- Qué se reporta — exactamente uno de los dos según target_type,
  -- forzado por el CHECK reports_target_matches_type.
  target_type       public.report_target_type not null,
  reported_user_id  uuid references public.profiles(id) on delete cascade,
  reported_job_id   uuid references public.jobs(id) on delete cascade,

  -- Contexto opcional: el trabajo en el que ocurrió el incidente,
  -- cuando se reporta a un USUARIO por algo relacionado a un job
  -- específico. Deliberadamente distinto de reported_job_id (que es el
  -- OBJETIVO cuando target_type='job') para no mezclar "contexto" con
  -- "objetivo" bajo el mismo nombre.
  related_job_id    uuid references public.jobs(id) on delete set null,

  reason            public.report_reason not null,
  description       text not null,

  status            public.report_status not null default 'pending',
  reviewed_by       uuid references public.profiles(id) on delete set null,
  reviewed_at       timestamptz,
  admin_notes       text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint reports_target_matches_type check (
    (target_type = 'user' and reported_user_id is not null and reported_job_id is null)
    or
    (target_type = 'job'  and reported_job_id  is not null and reported_user_id is null)
  ),

  -- Bloqueo de auto-reporte a nivel de base de datos — no solo en la
  -- UI ni en la Server Action. Se cumple sin importar qué cliente
  -- inserte la fila (incluso service_role, si se usara ahí por error).
  constraint reports_no_self_report check (
    reported_user_id is null or reported_user_id <> reporter_id
  )
);

create index if not exists idx_reports_reporter
  on public.reports (reporter_id, created_at desc);
create index if not exists idx_reports_reported_user
  on public.reports (reported_user_id) where reported_user_id is not null;
create index if not exists idx_reports_reported_job
  on public.reports (reported_job_id) where reported_job_id is not null;
create index if not exists idx_reports_status
  on public.reports (status, created_at desc);

-- Anti-duplicado: bloquea que el mismo denunciante abra un segundo
-- reporte activo (pending/under_review) contra el mismo usuario por el
-- mismo motivo. No bloquea reportar de nuevo tras resolución/descarte
-- (nuevo incidente), ni reportar por un motivo distinto mientras el
-- primero sigue activo (ver §12 del documento de diseño).
create unique index if not exists reports_no_duplicate_active
  on public.reports (reporter_id, reported_user_id, reason)
  where status in ('pending', 'under_review') and reported_user_id is not null;

-- Rate limit de volumen (~5 reportes/24h por reportante) marcado en el
-- diseño como decisión de producto pendiente de confirmar — NO
-- implementado en esta fase. Queda documentado aquí para que quede
-- explícito que fue una omisión deliberada, no un olvido.

-- ------------------------------------------------------------
-- RLS: reports
-- ------------------------------------------------------------
alter table public.reports enable row level security;

-- INSERT: el reportante solo puede crear su propio reporte, y solo en
-- estado inicial limpio — evita que un cliente malicioso inserte un
-- reporte ya "resuelto" o con notas de admin/reviewed_by precargadas.
drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
  on public.reports for insert
  to authenticated
  with check (
    reporter_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and admin_notes is null
  );

-- SELECT: el reportante puede leer su propia fila completa a nivel de
-- RLS (fila, no columna) — el motivo por el que esto es seguro pese a
-- admin_notes/reviewed_by vivir en la misma tabla está en
-- reporter_reports_view más abajo: los Server Actions orientados al
-- reportante consultan la vista, nunca esta tabla directamente.
drop policy if exists "reports_select_own_or_admin" on public.reports;
create policy "reports_select_own_or_admin"
  on public.reports for select
  using (reporter_id = auth.uid() or public.current_user_role() = 'admin');

-- UPDATE: exclusivamente admin. Un usuario normal no tiene ninguna
-- policy que lo alcance — ni siquiera puede intentar tocar su propio
-- reporte después de crearlo.
drop policy if exists "reports_update_admin" on public.reports;
create policy "reports_update_admin"
  on public.reports for update
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Candado de columna (mismo patrón que profile_photos/profile_stats,
-- 0013_harden_profile_module_rls.sql): USING/WITH CHECK de una policy
-- UPDATE solo filtran FILAS, no columnas — sin esto, un admin (o un
-- bug en una futura Server Action) podría reescribir reporter_id,
-- target_type, reported_user_id/reported_job_id, related_job_id o
-- created_at de un reporte ya creado. Esos campos deben ser inmutables
-- una vez insertados: son "qué pasó y quién lo reportó", no una
-- decisión administrativa. Solo las columnas que representan el
-- resultado de la revisión quedan escribibles.
revoke update on public.reports from authenticated;
grant update (status, reviewed_by, reviewed_at, admin_notes, updated_at)
  on public.reports to authenticated;

-- Sin policy DELETE para nadie, admin incluido. No hay ninguna razón
-- funcional para borrar un reporte: la trazabilidad de moderación
-- (moderation_actions) referencia reports.id con `on delete set null`
-- precisamente para sobrevivir a un borrado — pero permitir ese
-- borrado de todas formas invitaría a perder el contexto original
-- (reason/description/evidencia) sin necesidad. Si en el futuro se
-- requiere una política de retención de datos (derecho al olvido,
-- expiración), la forma correcta es anonimizar campos específicos vía
-- UPDATE, no un DELETE genérico — decisión de producto fuera de
-- alcance de esta fase.

-- ------------------------------------------------------------
-- VISTA: reporter_reports_view
--
-- RLS de Postgres opera a nivel de fila, no de columna condicionada a
-- datos: no puede expresar "el dueño de esta fila puede leerla, pero
-- sin la columna admin_notes". El candado de columna (REVOKE/GRANT,
-- patrón de 0013_harden_profile_module_rls.sql) tampoco sirve — ese
-- mecanismo solo puede decir "authenticated nunca toca esta columna",
-- no "authenticated-si-es-admin sí, los demás no" (distinción que
-- depende de datos, no del rol de conexión de Postgres).
--
-- Solución: una vista con columnas restringidas. security_invoker=true
-- hace que respete el RLS de la tabla base evaluado con los permisos
-- de quien consulta (no del dueño de la vista) — el `where reporter_id
-- = auth.uid()` de abajo es redundante con reports_select_own_or_admin
-- pero explícito. admin_notes/reviewed_by/reviewed_at no están ocultas
-- por permiso: no existen en el select de la vista.
-- ------------------------------------------------------------
create or replace view public.reporter_reports_view
  with (security_invoker = true) as
  select id, target_type, reported_user_id, reported_job_id, related_job_id,
         reason, status, created_at, updated_at
  from public.reports
  where reporter_id = auth.uid();

grant select on public.reporter_reports_view to authenticated;

-- ------------------------------------------------------------
-- TABLA: report_evidence
--
-- Tabla separada (no un array/jsonb en reports) — mismo patrón que
-- profile_photos/verification_documents: cada archivo es su propia
-- fila, nunca una columna array.
-- ------------------------------------------------------------
create table if not exists public.report_evidence (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.reports(id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  content_type text not null,
  uploaded_by  uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now()
);

create index if not exists idx_report_evidence_report
  on public.report_evidence (report_id);

alter table public.report_evidence enable row level security;

-- INSERT: solo mientras el reporte propio sigue en 'pending' — una vez
-- que un admin lo toma (under_review), ya no se admite evidencia
-- nueva, para que nadie pueda alterar el material bajo revisión activa.
drop policy if exists "report_evidence_insert_own" on public.report_evidence;
create policy "report_evidence_insert_own"
  on public.report_evidence for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.reports
      where id = report_id and reporter_id = auth.uid() and status = 'pending'
    )
  );

-- SELECT: quien la subió, o admin. El denunciado nunca es uploaded_by,
-- así que nunca alcanza esta policy.
drop policy if exists "report_evidence_select_own_or_admin" on public.report_evidence;
create policy "report_evidence_select_own_or_admin"
  on public.report_evidence for select
  using (uploaded_by = auth.uid() or public.current_user_role() = 'admin');

-- Sin policy UPDATE ni DELETE: la evidencia, una vez subida, es
-- inmutable en v1.

-- ------------------------------------------------------------
-- STORAGE: bucket privado report-evidence
--
-- Mismo patrón exacto que verification-documents (0010_professional_
-- profile.sql): bucket privado, folder-prefijado por uid del uploader.
-- Sin policy SELECT de storage.objects para authenticated en absoluto
-- — toda lectura pasa por signed URL generada server-side con
-- createAdminClient(), nunca por descarga directa del cliente. Ruta de
-- archivo esperada: ${reporterId}/${reportId}/${timestamp}.${ext}.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-evidence', 'report-evidence', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "report_evidence_storage_insert" on storage.objects;
create policy "report_evidence_storage_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'report-evidence'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- No se crea ninguna policy SELECT/UPDATE/DELETE de storage.objects
-- para 'report-evidence' — a propósito. La subida real (UI, flujo de
-- createSignedUploadUrl) y la lectura vía signed URL quedan para la
-- Fase 6 del checklist de implementación; esta migración solo deja la
-- infraestructura de base de datos lista.
