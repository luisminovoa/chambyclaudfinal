-- ============================================================
-- CHAMBY — Perfil Profesional Verificado (Fase 0)
-- Tablas: profile_photos, verification_documents, profile_stats
-- Buckets: profile-images (público), verification-documents (privado)
--
-- Portado desde supabase/migrations/0007_professional_profile.sql de la
-- rama claude/fix-rls-role-escalation-v1v4 (auditada en docs/, no
-- mergeada por traer funcionalidad adicional sin aprobar). Contenido
-- idéntico, solo renumerado a 0010 para encajar en la secuencia de esta
-- rama — nombres de tablas/buckets sin cambios por decisión explícita.
-- ============================================================

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------
do $$ begin
  create type public.document_type as enum (
    'dni', 'ruc', 'antecedentes_policiales', 'antecedentes_penales',
    'certificado', 'licencia', 'carnet', 'otro'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.document_status as enum ('pending', 'verified', 'rejected');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- TABLA: profile_photos
-- Fotos de perfil del trabajador (hasta 10 por usuario)
-- ------------------------------------------------------------
create table if not exists public.profile_photos (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  storage_path  text not null,
  public_url    text not null,
  is_primary    boolean not null default false,
  display_order int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_profile_photos_profile
  on public.profile_photos (profile_id);

-- Restricción: solo una foto principal por usuario
create unique index if not exists idx_profile_photos_primary
  on public.profile_photos (profile_id)
  where is_primary = true;

-- ------------------------------------------------------------
-- TABLA: verification_documents
-- Documentos de identidad y certificaciones profesionales
-- ------------------------------------------------------------
create table if not exists public.verification_documents (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  document_type public.document_type not null,
  storage_path  text not null,
  file_name     text not null,
  status        public.document_status not null default 'pending',
  uploaded_at   timestamptz not null default now(),
  verified_at   timestamptz
);

create index if not exists idx_verification_docs_profile
  on public.verification_documents (profile_id);

-- ------------------------------------------------------------
-- TABLA: profile_stats
-- Porcentaje de completitud e insignias (cache calculado)
-- ------------------------------------------------------------
create table if not exists public.profile_stats (
  profile_id            uuid primary key references public.profiles(id) on delete cascade,
  completion_percentage int not null default 0,
  trust_score           int not null default 0,
  badges                text[] not null default '{}',
  updated_at            timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.profile_photos enable row level security;
alter table public.verification_documents enable row level security;
alter table public.profile_stats enable row level security;

-- profile_photos: el usuario solo accede a sus propias fotos
drop policy if exists "photos_select_own"  on public.profile_photos;
drop policy if exists "photos_insert_own"  on public.profile_photos;
drop policy if exists "photos_update_own"  on public.profile_photos;
drop policy if exists "photos_delete_own"  on public.profile_photos;

create policy "photos_select_own"  on public.profile_photos
  for select using (auth.uid() = profile_id);
create policy "photos_insert_own"  on public.profile_photos
  for insert with check (auth.uid() = profile_id);
create policy "photos_update_own"  on public.profile_photos
  for update using (auth.uid() = profile_id);
create policy "photos_delete_own"  on public.profile_photos
  for delete using (auth.uid() = profile_id);

-- verification_documents: owner ve/sube/elimina; solo admin puede cambiar status
drop policy if exists "docs_select_own"   on public.verification_documents;
drop policy if exists "docs_insert_own"   on public.verification_documents;
drop policy if exists "docs_delete_own"   on public.verification_documents;
drop policy if exists "docs_update_admin" on public.verification_documents;

create policy "docs_select_own"   on public.verification_documents
  for select using (auth.uid() = profile_id);
create policy "docs_insert_own"   on public.verification_documents
  for insert with check (auth.uid() = profile_id);
create policy "docs_delete_own"   on public.verification_documents
  for delete using (auth.uid() = profile_id);
create policy "docs_update_admin" on public.verification_documents
  for update using (public.current_user_role() = 'admin');

-- profile_stats: solo acceso propio
drop policy if exists "stats_select_own" on public.profile_stats;
drop policy if exists "stats_insert_own" on public.profile_stats;
drop policy if exists "stats_update_own" on public.profile_stats;

create policy "stats_select_own" on public.profile_stats
  for select using (auth.uid() = profile_id);
create policy "stats_insert_own" on public.profile_stats
  for insert with check (auth.uid() = profile_id);
create policy "stats_update_own" on public.profile_stats
  for update using (auth.uid() = profile_id);

-- ------------------------------------------------------------
-- STORAGE BUCKETS
-- ------------------------------------------------------------

-- Fotos de perfil: bucket público (las URLs son accesibles sin auth)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-images',
  'profile-images',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
) on conflict (id) do nothing;

-- Documentos de verificación: bucket privado
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification-documents',
  'verification-documents',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
) on conflict (id) do nothing;

-- ------------------------------------------------------------
-- STORAGE RLS — profile-images (público)
-- SELECT sin restricción (bucket público); INSERT y DELETE solo dueño
-- ------------------------------------------------------------
drop policy if exists "profile_images_select" on storage.objects;
drop policy if exists "profile_images_insert" on storage.objects;
drop policy if exists "profile_images_delete" on storage.objects;

create policy "profile_images_select" on storage.objects
  for select using (bucket_id = 'profile-images');

create policy "profile_images_insert" on storage.objects
  for insert with check (
    bucket_id = 'profile-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "profile_images_delete" on storage.objects
  for delete using (
    bucket_id = 'profile-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ------------------------------------------------------------
-- STORAGE RLS — verification-documents (privado)
-- Solo el dueño puede leer, subir y eliminar sus propios documentos
-- ------------------------------------------------------------
drop policy if exists "verification_docs_select" on storage.objects;
drop policy if exists "verification_docs_insert" on storage.objects;
drop policy if exists "verification_docs_delete" on storage.objects;

create policy "verification_docs_select" on storage.objects
  for select using (
    bucket_id = 'verification-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "verification_docs_insert" on storage.objects
  for insert with check (
    bucket_id = 'verification-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "verification_docs_delete" on storage.objects
  for delete using (
    bucket_id = 'verification-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
