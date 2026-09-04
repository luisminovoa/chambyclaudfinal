-- ============================================================
-- CHAMBY — FASE 3B (Calendario): excepciones puntuales de disponibilidad
-- ============================================================
-- Único objeto de negocio de esta migración: profile_availability_exceptions.
-- Complementa a profile_availability_slots (0051): un override por fecha
-- concreta para un perfil (worker o employer), sin tocar ninguna tabla,
-- función o trigger existente, incluida 0051.
-- ============================================================

create table public.profile_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  exception_date date not null,
  is_available boolean not null,
  start_time time null,
  end_time time null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_availability_exceptions_unique_date
    unique (profile_id, exception_date),
  constraint profile_availability_exceptions_coherence_check
    check (
      (is_available = true
        and start_time is not null
        and end_time is not null
        and end_time > start_time)
      or
      (is_available = false
        and start_time is null
        and end_time is null)
    )
);

-- No se crea un índice adicional sobre profile_id: el índice único
-- generado automáticamente por unique(profile_id, exception_date) ya
-- cubre las búsquedas por profile_id solo (regla de prefijo izquierdo
-- de un índice btree compuesto) — crear uno separado sería exactamente
-- el índice redundante que esta fase pide evitar.

-- ------------------------------------------------------------
-- RLS: mismo patrón que profile_availability_slots (0051) — lectura
-- pública, escritura solo del dueño. Sin rama de admin, sin funciones,
-- sin triggers, sin grants explícitos: fuera del alcance aprobado para
-- esta fase.
-- ------------------------------------------------------------
alter table public.profile_availability_exceptions enable row level security;

create policy "availability_exceptions_select_all"
  on public.profile_availability_exceptions for select
  using (true);

create policy "availability_exceptions_insert_own"
  on public.profile_availability_exceptions for insert
  with check (profile_id = auth.uid());

create policy "availability_exceptions_update_own"
  on public.profile_availability_exceptions for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "availability_exceptions_delete_own"
  on public.profile_availability_exceptions for delete
  using (profile_id = auth.uid());
