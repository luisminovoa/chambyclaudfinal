# Sistema completo de contratación — diseño funcional (revisión 4)

> **Estado: APROBADO — en implementación.**
>
> Revisión 4 incorpora las decisiones arquitectónicas finales del usuario
> (julio 2026): chat automático al aceptar, audit trail completo, reglas
> estrictas de cancelación e infraestructura Realtime compartida.

---

## 1. Diagrama de estados

```
              postular
 abierto ─────────────────► en_progreso ──── completar ──► completado (terminal)
    │         (trigger acepta      │
    │          + chat creado       │ cancelar
    │          + notificación)     │ (solo via flujo especial
    │                              │  de incidente)
    │ cancelar
    ▼
 cancelado (terminal)
```

**Regla de cancelación:**
- `abierto` → `cancelado` : acción directa del empleador, requiere confirmación.
- `en_progreso` → *cancelar* : flujo de incidente aparte (PR separado). No se
  implementa en este PR.

**Postulación (`job_applications.status`):**
```
 pendiente ──── (empleador acepta) ──── aceptado
    │                                      │
    ├── (empleador rechaza)                (único por trabajo)
    │
    └── (empleador acepta a otro) ── rechazado (cascada automática)
    │
    └── (trabajador retira)        ── retirado (nueva acción en este PR)
```

---

## 2. Flujo del trabajador

1. Explora y postula a un trabajo `abierto`.
2. Su postulación queda `pendiente`; puede retirarla mientras siga pendiente.
3. **Si rechazado**: queda en historial con estado real.
4. **Si aceptado**:
   - Recibe notificación in-app "Fuiste contratado".
   - Se crea automáticamente una conversación privada empleador ↔ trabajador.
   - Ve el timeline de seguimiento en el detalle del trabajo.
   - Cuando el empleador marca completado → aparece formulario de calificación.

---

## 3. Flujo del empleador

1. Publica y recibe postulaciones.
2. Confirma antes de aceptar: *"Vas a contratar a {nombre}. Las demás
   postulaciones pendientes se rechazarán automáticamente."*
3. **Al aceptar (atomic)**:
   - `jobs.assigned_worker_id` ← trabajador.
   - `jobs.status` ← `en_progreso`, `jobs.hired_at` ← `now()`.
   - Postulaciones `pendiente` del mismo job → `rechazado`.
   - Conversación privada creada automáticamente.
   - Notificación enviada al trabajador.
   - Entrada en `job_state_history` registrada.
4. Ve tarjeta del trabajador asignado y timeline en el detalle del trabajo.
5. Marca **completado** → `jobs.status` ← `completado`, `jobs.completed_at`
   ← `now()`, entrada en historial.
6. Ambos pueden calificarse mutuamente.

---

## 4. Reglas de negocio

| # | Regla | Estado |
|---|-------|--------|
| R1 | Un trabajo tiene máximo un trabajador asignado | Vigente |
| R2 | Solo se postula a trabajos `abierto` | Vigente |
| R3 | Aceptar rechaza automáticamente las demás postulaciones `pendiente` | Vigente (trigger) |
| R4 | Calificación mutua solo con `completado` + ser participante | Vigente |
| R5 | Retirar postulación solo mientras esté `pendiente` | **Nuevo en este PR** |
| R6 | Al cancelar `en_progreso` → flujo de incidente separado | **Reservado** |
| R7 | Un trabajo `cancelado` no se reabre — se publica uno nuevo | **Confirmado** |
| R8 | Confirmación obligatoria en UI antes de aceptar | **Nuevo en este PR** |
| R9 | Rating: solo al completarse, uno por usuario por trabajo, **inmutable** | **Confirmado** |
| R10 | Chat privado: solo existe cuando hay un trabajador aceptado | **Confirmado** |
| R11 | Toda transición de estado se registra en `job_state_history` | **Nuevo en este PR** |

---

## 5. Modelo de datos

### Existente (sin modificar)
- `jobs`, `job_applications`, `profiles`, `ratings` — sin cambios en columnas.

### Columnas nuevas en `jobs` (nullable, retrocompatibles)
```sql
hired_at     timestamptz   -- cuándo se contrató al trabajador
completed_at timestamptz   -- cuándo se marcó completado
cancelled_at timestamptz   -- cuándo se canceló
```

### Tabla nueva: `job_state_history`
```sql
id           uuid  PK
job_id       uuid  FK jobs
actor_id     uuid  FK profiles (quien ejecutó la acción)
prev_status  job_status
new_status   job_status
notes        text nullable
created_at   timestamptz default now()
```

### Tabla nueva: `conversations`
```sql
id           uuid  PK
job_id       uuid  FK jobs (unique — una conversación por trabajo)
employer_id  uuid  FK profiles
worker_id    uuid  FK profiles
created_at   timestamptz
```

### Tabla nueva: `messages`
```sql
id              uuid  PK
conversation_id uuid  FK conversations
sender_id       uuid  FK profiles
body            text  not null
read_at         timestamptz nullable
created_at      timestamptz
```

---

## 6. Cambios en la base de datos (`0002_hiring_tracking.sql`)

```sql
-- Columnas de timestamp en jobs
alter table public.jobs
  add column if not exists hired_at     timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz;

-- Audit trail de estados
create table if not exists public.job_state_history (
  id          uuid primary key default uuid_generate_v4(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  actor_id    uuid not null references public.profiles(id) on delete cascade,
  prev_status job_status,
  new_status  job_status not null,
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_state_history_job
  on public.job_state_history (job_id, created_at desc);

-- Conversaciones (una por trabajo, creada al contratar)
create table if not exists public.conversations (
  id          uuid primary key default uuid_generate_v4(),
  job_id      uuid not null unique references public.jobs(id) on delete cascade,
  employer_id uuid not null references public.profiles(id) on delete cascade,
  worker_id   uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Mensajes del chat
create table if not exists public.messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  body            text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_messages_conversation
  on public.messages (conversation_id, created_at);

-- Trigger actualizado: guarda de carrera + hired_at + crea conversación
create or replace function public.handle_application_accepted()
returns trigger as $$
declare v_job record;
begin
  if new.status = 'aceptado' and (old.status is distinct from 'aceptado') then
    select * into v_job from public.jobs where id = new.job_id;
    if v_job.status <> 'abierto' then
      raise exception 'Este trabajo ya no acepta postulantes';
    end if;

    update public.jobs
      set assigned_worker_id = new.worker_id,
          status  = 'en_progreso',
          hired_at = now()
      where id = new.job_id;

    update public.job_applications
      set status = 'rechazado'
      where job_id = new.job_id and id <> new.id and status = 'pendiente';

    insert into public.conversations (job_id, employer_id, worker_id)
      values (new.job_id, v_job.employer_id, new.worker_id)
      on conflict (job_id) do nothing;

    insert into public.job_state_history
      (job_id, actor_id, prev_status, new_status, notes)
      values (new.job_id, v_job.employer_id, 'abierto', 'en_progreso',
              'Trabajador aceptado — automático');
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
```

### RLS de las nuevas tablas

```sql
-- job_state_history: solo participantes del trabajo o admin
alter table public.job_state_history enable row level security;
create policy "history_select_participant"
  on public.job_state_history for select
  using (
    job_id in (
      select id from public.jobs
      where employer_id = auth.uid() or assigned_worker_id = auth.uid()
    )
    or public.current_user_role() = 'admin'
  );
create policy "history_insert_system"
  on public.job_state_history for insert
  with check (actor_id = auth.uid() or public.current_user_role() = 'admin');

-- conversations: employer y worker del job
alter table public.conversations enable row level security;
create policy "conversations_select_participant"
  on public.conversations for select
  using (employer_id = auth.uid() or worker_id = auth.uid()
         or public.current_user_role() = 'admin');
create policy "conversations_insert_system"
  on public.conversations for insert
  with check (public.current_user_role() = 'admin'
              or auth.uid() in (
                select employer_id from public.jobs where jobs.id = job_id
              ));

-- messages: solo participantes de la conversación
alter table public.messages enable row level security;
create policy "messages_select_participant"
  on public.messages for select
  using (
    conversation_id in (
      select id from public.conversations
      where employer_id = auth.uid() or worker_id = auth.uid()
    )
  );
create policy "messages_insert_participant"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and conversation_id in (
      select id from public.conversations
      where employer_id = auth.uid() or worker_id = auth.uid()
    )
  );
```

---

## 7. Permisos por rol

| Acción | Trabajador | Empleador (dueño) | Admin |
|--------|-----------|-------------------|-------|
| Postular | Sí | — | Solo si rol worker |
| Retirar su postulación | Solo si `pendiente` | — | — |
| Ver postulantes | — | Sí | Sí |
| Aceptar/rechazar postulante | — | Solo si job `abierto` | — |
| Marcar completado | — | Solo si `en_progreso` | Vía moderación |
| Cancelar trabajo | — | Solo si `abierto` | Sí |
| Ver tarjeta del asignado | Solo si es él | Sí | Sí |
| Calificar contraparte | Solo asignado + completado | Solo si completado | — |
| Ver historial de estados | Solo si participante | Sí | Sí |
| Ver conversación | Solo si es él | Sí | Sí |
| Enviar mensaje | Solo si es él | Sí (solo si `en_progreso`) | — |

---

## 8. Casos límite resueltos

| Caso | Resolución |
|------|-----------|
| Aceptación concurrente de dos postulantes | Guarda `raise exception` en trigger — el segundo falla con HTTP 500 limpio |
| Rating duplicado | Restricción `unique(job_id, rater_id, rated_id)` — ya existía |
| Admin cambia estado fuera del flujo | Acción de moderación consciente; el historial refleja el actor |
| Cancelar `en_progreso` | Flujo de incidente separado (PR posterior) |
| Trabajador quiere retirarse tras ser aceptado | Sin flujo de disputa; el empleador cancela y republica |

---

## 9. Infraestructura Realtime (compartida)

Un único hook `useRealtimeSubscriptions(jobId?)` en
`src/lib/realtime/useRealtimeSubscriptions.ts` suscribe a:

| Canal | Tabla | Filtro |
|-------|-------|--------|
| `jobs:{id}` | `jobs` | `id=eq.{jobId}` |
| `applications:{jobId}` | `job_applications` | `job_id=eq.{jobId}` |
| `messages:{convId}` | `messages` | `conversation_id=eq.{convId}` |

Las páginas del MVP v1.0 que reutilicen este hook (chat, notificaciones,
dashboard) solo necesitan suscribirse al canal relevante — no construyen
su propia conexión Realtime.

---

## 10. Pantallas implementadas en este PR

1. **`/jobs/[id]` — detalle del trabajo**
   - Tarjeta del trabajador asignado (empleador y trabajador).
   - Timeline de estados con timestamps.
   - Botón "Marcar como completado" (empleador, solo `en_progreso`).
   - Botón "Cancelar trabajo" (empleador, solo `abierto`, con confirmación).
   - Banner "Fuiste contratado" (trabajador, solo `en_progreso`).
   - Sección de calificación mutua (solo `completado`).

2. **`/dashboard` — panel del empleador**
   - Fila de postulante con botón inline de aceptar + modal de confirmación.
   - Badge de estado actualizado en tiempo real (Realtime).

3. **`/dashboard` — panel del trabajador**
   - Sección "Mis trabajos activos" con estado en tiempo real.

---

## 11. Riesgos técnicos

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| Condición de carrera en aceptación doble | Alta | Guarda `raise exception` en trigger |
| Migración manual sin pipeline | Baja | Aplicar en Supabase SQL Editor antes de deploy |
| `security definer` en trigger | Baja | Acotado a esta función; sin ampliar |
| Sin pruebas automatizadas | Media | Ítem propio post-MVP |
