-- ============================================================
-- CHAMBY — Panel de verificación de documentos para admin
--
-- Reutiliza la estructura existente de 0010_professional_profile.sql
-- (verification_documents, document_status 'pending'|'verified'|'rejected',
-- bucket privado verification-documents) — no se crea ninguna tabla
-- duplicada. Solo se agrega lo que faltaba: motivo/observación de
-- rechazo, quién y cuándo revisó, un log de auditoría append-only, y
-- las policies/trigger necesarios para que admin pueda listar, revisar
-- y que el trabajador reciba notificación automática del resultado.
-- ============================================================

-- ------------------------------------------------------------
-- ENUM: motivo de rechazo (no existía nada reutilizable)
-- ------------------------------------------------------------
do $$ begin
  create type public.document_rejection_reason as enum (
    'illegible', 'expired', 'data_mismatch', 'wrong_document', 'other'
  );
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- verification_documents: columnas de revisión
-- ------------------------------------------------------------
alter table public.verification_documents
  add column if not exists rejection_reason public.document_rejection_reason,
  add column if not exists rejection_note   text,
  add column if not exists reviewed_by      uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at      timestamptz;

-- ------------------------------------------------------------
-- TABLA: verification_document_reviews (auditoría append-only)
-- Mismo patrón que job_state_history (0002_hiring_tracking.sql):
-- cada transición de estado queda registrada con actor + timestamp,
-- separada de la fila "actual" para no perder el historial cuando un
-- documento se revisa más de una vez (p.ej. rechazado → el trabajador
-- sube uno nuevo → aprobado).
-- ------------------------------------------------------------
create table if not exists public.verification_document_reviews (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references public.verification_documents(id) on delete cascade,
  reviewed_by      uuid not null references public.profiles(id) on delete cascade,
  previous_status  public.document_status not null,
  new_status       public.document_status not null,
  rejection_reason public.document_rejection_reason,
  rejection_note   text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_doc_reviews_document
  on public.verification_document_reviews (document_id, created_at desc);

alter table public.verification_document_reviews enable row level security;

-- SELECT: el propio dueño del documento (para ver por qué fue
-- rechazado) o admin. Igual que notifications (0004_notifications.sql):
-- sin policy INSERT para `authenticated` — solo el trigger
-- security definer de más abajo escribe aquí.
drop policy if exists "doc_reviews_select_own_or_admin" on public.verification_document_reviews;
create policy "doc_reviews_select_own_or_admin"
  on public.verification_document_reviews for select
  using (
    document_id in (
      select id from public.verification_documents where profile_id = auth.uid()
    )
    or public.current_user_role() = 'admin'
  );

-- ------------------------------------------------------------
-- verification_documents: admin necesita poder LISTAR todos los
-- documentos (bandeja de pendientes), no solo actualizar status.
-- docs_select_own (0010) era owner-only — se reemplaza por la misma
-- variante owner-or-admin que ya usan worker_profile_details (0011) y
-- worker_experience (0012).
-- ------------------------------------------------------------
drop policy if exists "docs_select_own" on public.verification_documents;
drop policy if exists "docs_select_own_or_admin" on public.verification_documents;
create policy "docs_select_own_or_admin"
  on public.verification_documents for select
  using (auth.uid() = profile_id or public.current_user_role() = 'admin');

-- docs_update_admin (0010) tenía USING pero sin WITH CHECK explícito.
-- No era la vulnerabilidad V1 (0009: esa policy comparaba auth.uid()
-- contra una columna de la fila, mutable por el propio UPDATE) — aquí
-- current_user_role() depende solo de auth.uid() de la sesión, no de
-- ninguna columna de verification_documents, así que un WITH CHECK
-- implícito igual a USING ya era seguro. Se agrega explícito de todas
-- formas, mismo estilo de hardening que el resto del esquema.
drop policy if exists "docs_update_admin" on public.verification_documents;
create policy "docs_update_admin" on public.verification_documents
  for update
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ------------------------------------------------------------
-- Trigger: cambio de estado de un documento → notifica al trabajador
-- y registra la auditoría. Mismo patrón que
-- notify_application_status_changed() (0004_notifications.sql) y
-- handle_application_accepted() (0001_init.sql): la transición de
-- estado y sus efectos secundarios quedan atómicos en un solo trigger
-- security definer, no repartidos entre Server Action y DB.
-- ------------------------------------------------------------
create or replace function public.notify_document_status_changed()
returns trigger as $$
declare
  v_reason_label text;
begin
  if new.status is distinct from old.status then
    insert into public.verification_document_reviews
      (document_id, reviewed_by, previous_status, new_status, rejection_reason, rejection_note)
    values
      (new.id, new.reviewed_by, old.status, new.status, new.rejection_reason, new.rejection_note);

    if new.status = 'verified' then
      insert into public.notifications
        (user_id, type, title, body, data, priority, sender_id)
      values (
        new.profile_id,
        'system',
        'Documento aprobado',
        'Tu documento ha sido aprobado.',
        jsonb_build_object('documentId', new.id, 'documentType', new.document_type),
        'normal',
        new.reviewed_by
      );
    elsif new.status = 'rejected' then
      v_reason_label := case new.rejection_reason
        when 'illegible'      then 'Documento ilegible'
        when 'expired'        then 'Documento vencido'
        when 'data_mismatch'  then 'Datos no coinciden'
        when 'wrong_document' then 'Documento incorrecto'
        else 'Otro motivo'
      end;
      insert into public.notifications
        (user_id, type, title, body, data, priority, sender_id)
      values (
        new.profile_id,
        'system',
        'Documento rechazado',
        'Tu documento necesita corrección. Motivo: ' || v_reason_label ||
          coalesce('. ' || new.rejection_note, ''),
        jsonb_build_object(
          'documentId', new.id,
          'documentType', new.document_type,
          'rejectionReason', new.rejection_reason
        ),
        'high',
        new.reviewed_by
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_document_status_changed on public.verification_documents;
create trigger on_document_status_changed
  after update on public.verification_documents
  for each row execute function public.notify_document_status_changed();
