-- ============================================================
-- CHAMBY — Auth Hardening (Auditoría de autenticación)
-- AUTH-005: handle_new_user guarda avatar_url de Google OAuth
--           y tiene ON CONFLICT safety net para evitar duplicados.
-- Sin migraciones destructivas.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, full_name, city, category, avatar_url)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'worker'),
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      'Nuevo usuario'
    ),
    new.raw_user_meta_data->>'city',
    new.raw_user_meta_data->>'category',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
