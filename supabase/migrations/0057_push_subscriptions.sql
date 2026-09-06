-- ============================================================
-- CHAMBY — P1-B1 (Web Push): tabla de suscripciones del navegador.
-- ============================================================
-- Alcance exclusivo de esta migración: tabla push_subscriptions + su RLS.
-- NO instala pg_cron/pg_net, NO crea trigger alguno, NO modifica
-- notifications/jobs/job_reminders/send_job_reminders() ni ninguna
-- migración/objeto existente. La integración con 0056 (trigger +
-- pg_net + Edge Function) es una fase posterior (P1-B2/P1-B3),
-- deliberadamente fuera de este archivo — ver diseño P1-A.
--
-- Guarda una fila por PushSubscription real del navegador (endpoint +
-- claves de cifrado del protocolo Web Push), nunca el contenido de las
-- notificaciones ni ninguna clave VAPID (esas viven solo como secret de
-- la futura Edge Function, jamás en esta tabla ni en el repositorio).
-- ============================================================

create table public.push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- ------------------------------------------------------------
-- RLS — el usuario solo puede ver/crear/actualizar/borrar SUS PROPIAS
-- suscripciones. `user_id` nunca se confía desde el cliente ni siquiera
-- vía RLS: WITH CHECK obliga a que coincida con auth.uid() tanto al
-- insertar como al actualizar, así que un payload que intente asociar
-- el endpoint a otro user_id es rechazado a nivel de base de datos,
-- independientemente de lo que la Server Action ya valide en TypeScript
-- (savePushSubscription()/deletePushSubscription(), src/lib/actions/
-- push.ts) — misma defensa en profundidad que el resto del proyecto.
--
-- A diferencia de job_reminders/profile_stats (0056/0013), esta tabla
-- SÍ permite INSERT/UPDATE directos para `authenticated`: el valor que
-- protege (endpoint/p256dh/auth de la PROPIA suscripción) no es un dato
-- que deba originarse en el servidor (a diferencia de un badge de
-- verificación o un storage_path usado en un borrado privilegiado) —
-- aunque un usuario corrompiera su propio payload, el único efecto
-- posible es que ÉL MISMO deje de recibir sus propios push, nunca un
-- efecto sobre otro usuario, porque WITH CHECK ata cada fila a su propio
-- auth.uid() de forma estructural.
-- ------------------------------------------------------------

create policy "push_subscriptions_select_own"
  on public.push_subscriptions
  for select
  using (user_id = auth.uid());

create policy "push_subscriptions_insert_own"
  on public.push_subscriptions
  for insert
  with check (user_id = auth.uid());

create policy "push_subscriptions_update_own"
  on public.push_subscriptions
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "push_subscriptions_delete_own"
  on public.push_subscriptions
  for delete
  using (user_id = auth.uid());
