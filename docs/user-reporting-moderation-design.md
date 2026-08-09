# Chamby — Sistema de Reportes de Usuario y Moderación
## Documento de Diseño v1.0

**Estado:** PROPUESTO — pendiente de aprobación. No se ha modificado ningún archivo
de código, RLS ni migraciones para este feature.
**Autor:** Claude Code
**Fecha:** 2026-08-09
**Contexto:** la auditoría del sistema de reportes (misma conversación) confirmó que
`bug_reports` (`0005_beta.sql`) es exclusivamente para errores técnicos de la app y
que **no existe** ningún sistema de reporte usuario-a-usuario en el repositorio. Este
documento diseña ese sistema desde cero, y de paso corrige (solo en diseño, no en
código) el hallazgo CRÍTICO de esa auditoría: `getBetaStats()`/`getBugReports()`
(`src/lib/actions/beta.ts`) usan `createAdminClient()` sin `assertAdmin()` interno.

---

## 0. Resumen ejecutivo

Se propone un sistema nuevo e independiente — tabla `reports` + tabla satélite
`report_evidence` + tabla de auditoría `moderation_actions` — que reutiliza en su
totalidad los patrones de seguridad ya probados en este proyecto (RLS "owner-or-admin"
de `verification_documents`, triggers `security definer` de `notifications`,
`assertAdmin()` de `admin.ts`, signed URLs de Storage) en vez de inventar mecanismos
nuevos. No se reutiliza `bug_reports` para nada de esto — son dominios distintos con
ciclos de vida distintos.

Decisión de diseño central: **una tabla `reports` con `target_type` (`user` | `job`)**
en vez de tablas separadas por tipo de objetivo — justificado en §2. Segunda decisión
central: **RLS no puede redactar columnas dentro de una fila que el dueño sí puede
leer** (ej. el denunciante no debe ver `admin_notes`, pero sí su propio `status`) — la
solución es una vista (`reporter_reports_view`) + disciplina de Server Actions, no un
intento de forzarlo vía RLS — justificado en §6.3.

---

## 1. Separación de sistemas

### A. Bug Reports (existente, sin cambios)

| | |
|---|---|
| Tabla | `bug_reports` (`0005_beta.sql`) |
| Qué reporta | Errores técnicos de la aplicación (ruta, navegador, OS, descripción libre) |
| Quién reporta | Cualquier visitante (logueado o no, por diseño — aunque la policy actual tiene el bug detectado en la auditoría de bloquear anon, ver Immediate Fix §16) |
| Panel admin | `/admin/beta`, sección "Reportes de error recientes" |
| Server Actions | `submitBugReport`, `getBetaStats`, `getBugReports` (`src/lib/actions/beta.ts`) |

**No se toca nada de esto.** Ninguna tabla, columna, Server Action ni componente de
este sistema se reutiliza para moderación.

### B. User Reports / Moderation (nuevo, este documento)

| | |
|---|---|
| Tablas | `reports`, `report_evidence`, `moderation_actions` |
| Qué reporta | Un usuario reporta a otro usuario, o reporta una oferta de trabajo |
| Quién reporta | Solo usuarios autenticados (`worker`/`employer`/`admin`) |
| Panel admin | `/admin/reports` (nuevo), `/admin/reports/[id]` (nuevo) |
| Server Actions | `src/lib/actions/reports.ts` (usuario) + `src/lib/actions/admin-reports.ts` (admin) |

Los dos sistemas son estructuralmente independientes: viven en archivos y tablas
distintas, tienen su propio enum de estado, su propio panel admin, y ninguno importa
del otro.

---

## 2. Casos de uso — ¿un modelo único o tablas separadas?

**Decisión: un modelo único (`reports` con `target_type`), no tablas separadas por
tipo de objetivo.**

### 2.1 Los tres casos de uso pedidos

1. **Trabajador reporta empleador** — `target_type = 'user'`, `reported_user_id` = el
   empleador.
2. **Empleador reporta trabajador** — `target_type = 'user'`, `reported_user_id` = el
   trabajador.
3. **Usuario reporta una oferta** — `target_type = 'job'`, `reported_job_id` = la
   oferta.

Los casos 1 y 2 son simétricos a nivel de esquema (ambos son "reporto a otro usuario")
— la dirección (trabajador→empleador vs. empleador→trabajador) no necesita una
columna propia: se infiere comparando `reporter_id`/`reported_user_id` contra
`profiles.role` en el momento de leer, no se persiste como un tercer "tipo".

### 2.2 Por qué un modelo único y no `user_reports` + `job_reports` separadas

| Criterio | Modelo único (`reports` + `target_type`) | Tablas separadas |
|---|---|---|
| Ciclo de vida (status, review, notas, auditoría) | Idéntico para ambos casos — una sola definición | Duplicado en dos tablas |
| Panel admin | Una sola lista, un solo filtro de estado/fecha, más `target_type` como filtro adicional | Dos listas a fusionar en la UI, o dos pestañas — peor UX para "ver todo lo pendiente" |
| `moderation_actions.report_id` | Un solo tipo de FK | FK polimórfica o dos columnas nullable de todos modos |
| Contadores/estadísticas (`getReportCounts()`) | Un `group by status` | Dos consultas a combinar |
| Costo de la decisión | Dos columnas nullable + 1 `CHECK` para mantenerlas mutuamente excluyentes | Ninguno, pero se paga en todas las filas de arriba |

El único costo real del modelo único es tener `reported_user_id` y `reported_job_id`
nullable con un `CHECK` que garantiza que exactamente uno esté poblado según
`target_type` — exactamente el mismo patrón de "columnas nullable + constraint" que ya
usa este proyecto en otros lados (p. ej. `jobs.assigned_worker_id` nullable hasta que
se acepta una postulación). Se considera un costo bajo frente a duplicar todo el
resto del sistema.

---

## 3. Modelo de datos

### 3.1 Enums

```sql
create type public.report_target_type as enum ('user', 'job');

create type public.report_reason as enum (
  'scam_fraud',             -- estafa / fraude / oferta falsa
  'inappropriate_behavior', -- comportamiento inapropiado
  'non_compliance',         -- incumplimiento
  'harassment',             -- acoso
  'suspicious_request',     -- solicitud sospechosa (p.ej. pedir datos o dinero fuera de la plataforma)
  'payment_issue',          -- pago problemático
  'no_show',                -- el trabajador no se presentó
  'false_information',      -- información falsa en perfil o postulación
  'inappropriate_content',  -- contenido inapropiado (oferta)
  'suspicious_terms',       -- condiciones sospechosas (oferta)
  'discrimination',         -- discriminación (oferta)
  'spam',                   -- spam
  'other'
);

create type public.report_status as enum (
  'pending',
  'under_review',
  'resolved',
  'dismissed'
);

create type public.moderation_action_type as enum (
  'status_changed',       -- registrado automáticamente por trigger, no manual
  'note_added',
  'warning_issued',
  'temporary_suspension',
  'permanent_block',
  'account_deactivated',
  'no_action'
);
```

`report_reason` es un solo enum compartido entre los tres casos de uso en vez de tres
catálogos separados — hay solapamiento real (`harassment`, `non_compliance`,
`scam_fraud`, `other` aplican a los tres) y los valores específicos de cada caso
(`no_show` solo aplica a trabajador; `discrimination`/`spam` solo a ofertas) simplemente
no se muestran como opción en la UI según `target_type` + rol del reportante — la
validación de "qué motivos son válidos para este contexto" vive en la Server Action
(Zod) y en el catálogo de UI (`src/lib/report-config.ts`, ver §5), no en el enum de
Postgres. Mismo criterio que ya documenta `CLAUDE.md` para status transitions: *"RLS
restricts who, the action must still restrict what value."*

`report_status` deliberadamente **no** incluye un estado `closed` separado de
`resolved`/`dismissed` — ambos ya son terminales (uno implica que se tomó una acción,
el otro que se investigó y no aplicaba) y un tercer estado terminal sería ambiguo
frente a esos dos sin aportar información nueva.

### 3.2 Tabla `reports`

```sql
create table public.reports (
  id                uuid primary key default gen_random_uuid(),

  -- Quién reporta — nunca confiar en un reporter_id enviado por el cliente,
  -- siempre auth.uid() del lado servidor (ver §6.1 y §15).
  reporter_id       uuid not null references public.profiles(id) on delete cascade,

  -- Qué se reporta — exactamente uno de los dos según target_type.
  target_type       public.report_target_type not null,
  reported_user_id  uuid references public.profiles(id) on delete cascade,
  reported_job_id   uuid references public.jobs(id) on delete cascade,

  -- Contexto opcional: el trabajo en el que ocurrió el incidente, cuando se
  -- reporta a un USUARIO por algo relacionado a un job específico (p.ej.
  -- "no pagó por el trabajo X"). Deliberadamente distinto de reported_job_id
  -- (que es el OBJETIVO cuando target_type='job') para no mezclar "contexto"
  -- con "objetivo" bajo el mismo nombre — nombre ambiguo que el pedido
  -- explícitamente pidió evitar.
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

  -- Bloqueo de auto-reporte a nivel de base de datos — no solo en la UI ni
  -- en la Server Action. Se cumple sin importar qué cliente inserte la fila.
  constraint reports_no_self_report check (
    reported_user_id is null or reported_user_id <> reporter_id
  )
);

create index idx_reports_reporter on public.reports (reporter_id, created_at desc);
create index idx_reports_reported_user on public.reports (reported_user_id) where reported_user_id is not null;
create index idx_reports_reported_job on public.reports (reported_job_id) where reported_job_id is not null;
create index idx_reports_status on public.reports (status, created_at desc);
```

**Campos obligatorios**: `reporter_id`, `target_type`, `reason`, `description`, uno de
`reported_user_id`/`reported_job_id` (forzado por el `CHECK`).
**Opcionales**: `related_job_id`, `admin_notes`, `reviewed_by`, `reviewed_at`.
**Mutuamente excluyentes**: `reported_user_id` / `reported_job_id` (forzado por el
`CHECK`, no por convención).

`on delete cascade` en `reported_user_id`/`reported_job_id`: si el usuario u oferta
reportada se elimina, el reporte deja de tener sentido operativo y se elimina con él
— pero el **historial de `moderation_actions`** sí sobrevive (`on delete set null` ahí,
ver §3.4), que es donde realmente importa la trazabilidad a largo plazo ("¿por qué fue
suspendido?"), no en `reports` en sí.

### 3.3 Tabla `report_evidence`

```sql
create table public.report_evidence (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.reports(id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  content_type text not null,
  uploaded_by  uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now()
);

create index idx_report_evidence_report on public.report_evidence (report_id);
```

Tabla separada (no un array/jsonb en `reports`) — mismo patrón que `profile_photos`/
`verification_documents` en este proyecto: nunca se modela "una o más subidas de
archivo" como columna array, siempre como tabla 1:N con su propia fila por archivo.
`uploaded_by` debe ser igual a `reports.reporter_id` al crear el reporte (verificado
en la Server Action y en RLS, ver §6.4) — se deja como columna propia en vez de
inferirla siempre del reporte padre para dejar espacio, sin urgencia, a que un admin
adjunte evidencia propia en el futuro.

### 3.4 Tabla `moderation_actions`

```sql
create table public.moderation_actions (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid references public.reports(id) on delete set null,
  admin_id       uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete cascade,
  action_type    public.moderation_action_type not null,
  reason         text,
  metadata       jsonb not null default '{}',
  created_at     timestamptz not null default now()
);

create index idx_moderation_actions_target on public.moderation_actions (target_user_id, created_at desc);
create index idx_moderation_actions_report on public.moderation_actions (report_id);
```

`report_id` es `on delete set null` (no `cascade`) — a propósito: la pregunta que este
sistema debe poder responder es *"¿por qué fue suspendido este usuario?"*, y esa
respuesta no puede depender de que el reporte original siga existiendo. Append-only
por diseño (sin policy UPDATE/DELETE, ver §6.5) — mismo patrón que
`verification_document_reviews`/`job_state_history`, que tampoco son editables.

---

## 4. Estados y transiciones

```
pending ──────────┬──> under_review ──────────┬──> resolved
                   │                           │
                   └───────────────────────────┴──> dismissed

resolved / dismissed ──> under_review   (reabrir, p.ej. llega un reporte relacionado nuevo)
```

- `pending → under_review`: un admin abre el reporte para investigarlo.
- `pending → resolved`/`dismissed`: permitido directamente sin pasar por
  `under_review` — no forzar dos clics para casos obviamente resueltos/infundados.
- `under_review → resolved`/`dismissed`: el flujo normal tras investigar.
- `resolved`/`dismissed → under_review`: reapertura explícita, permitida — queda
  registrada como una fila más en `moderation_actions` (action_type='status_changed'),
  así que reabrir nunca "pierde" el registro de la decisión anterior.

**Dónde se define**: el enum en Postgres define los valores posibles; la
**legalidad de una transición específica** se valida en la Server Action
(`updateReportStatus()`, `src/lib/actions/admin-reports.ts`), no en un `CHECK`
de la tabla — mismo criterio que ya usa `adminUpdateJobStatus()`
(`VALID_JOB_STATUSES`, `src/lib/actions/admin.ts`): forzar máquinas de estado
completas a nivel de `CHECK` constraint agrega complejidad para un beneficio marginal
cuando ya hay un único punto de entrada (`assertAdmin()`-gated Server Action) que
puede validarlo en TypeScript.

**Quién puede cambiar el estado**: exclusivamente admin, vía Server Action — nunca el
reportante ni el reportado (RLS lo respalda, ver §6.5).

**¿Queda registrado el cambio?** Sí, automáticamente — un trigger `security definer`
(`notify_report_status_changed`, mismo patrón que `notify_document_status_changed()`
de `0016`) inserta una fila en `moderation_actions` en cada `UPDATE` de `status`, así
que ninguna Server Action necesita "acordarse" de escribir la auditoría por separado.

---

## 5. Catálogo de motivos (no texto libre)

`reason` es el enum de §3.1 — persistido como valor categórico para permitir
filtros/estadísticas/futuras sanciones automatizadas basadas en patrones. `description`
queda como explicación adicional en texto libre, nunca como sustituto del motivo
categórico.

Mapeo de labels en español (nuevo módulo `src/lib/report-config.ts`, mismo patrón que
`document-verification.ts`/`badge-config.ts` — un solo lugar para label + qué subconjunto
de motivos se ofrece según contexto):

```ts
export const REPORT_REASONS_USER_AS_EMPLOYER = [ // trabajador reporta empleador
  "scam_fraud", "inappropriate_behavior", "non_compliance",
  "harassment", "suspicious_request", "payment_issue", "other",
] as const;

export const REPORT_REASONS_USER_AS_WORKER = [ // empleador reporta trabajador
  "no_show", "inappropriate_behavior", "false_information",
  "non_compliance", "scam_fraud", "harassment", "other",
] as const;

export const REPORT_REASONS_JOB = [ // usuario reporta una oferta
  "scam_fraud", "inappropriate_content", "suspicious_terms",
  "discrimination", "spam", "other",
] as const;
```

---

## 6. Seguridad y RLS

### 6.1 Usuario normal — INSERT

```sql
alter table public.reports enable row level security;

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
```

- `reporter_id = auth.uid()` — no puede hacerse pasar por otro (no puede falsificar
  `reporter_id`).
- `reported_user_id <> reporter_id` — **ya forzado por el `CHECK` de tabla** (§3.2), no
  depende de esta policy — se cumple sin importar qué cliente inserte (incluso
  `service_role`, si alguna vez se usara ahí por error).
- `status = 'pending' and reviewed_by is null and ...` — evita que un cliente
  malicioso inserte un reporte ya "resuelto" o con notas de admin precargadas.

### 6.2 Usuario normal — no puede leer reportes ajenos

```sql
create policy "reports_select_own_or_admin"
  on public.reports for select
  using (reporter_id = auth.uid() or public.current_user_role() = 'admin');
```

Row-level: el reportante puede leer **su propia fila completa** a nivel de RLS — esto
es intencional y se explica en §6.3, porque RLS no puede filtrar columnas.

### 6.3 El problema que RLS no puede resolver solo: columnas admin-only dentro de una fila que el dueño sí puede leer

`admin_notes` (y en menor medida `reviewed_by`) no deben ser visibles para el
reportante, aunque sí pueda leer el resto de su propia fila (`status`, `reason`,
`created_at`). **RLS de Postgres opera a nivel de fila, no de columna condicionada a
datos** — el candado de columna (`REVOKE`/`GRANT` a nivel de columna, patrón de
`0013_harden_profile_module_rls.sql`) tampoco sirve aquí, porque ese mecanismo solo
puede decir "el rol Postgres `authenticated` no puede tocar esta columna en absoluto";
no puede decir "los `authenticated` que además son admin sí, los demás no" — esa
distinción depende de un valor de datos (`profiles.role`), no del rol de conexión de
Postgres.

**Solución: una vista con columnas restringidas, para lectura del propio reportante.**

```sql
create view public.reporter_reports_view
  with (security_invoker = true) as
  select id, target_type, reported_user_id, reported_job_id, related_job_id,
         reason, status, created_at, updated_at
  from public.reports
  where reporter_id = auth.uid();

grant select on public.reporter_reports_view to authenticated;
```

`security_invoker = true` (Postgres 15+/Supabase lo soporta) hace que la vista respete
el RLS de la tabla base evaluado con los permisos de quien consulta, no del dueño de
la vista — así que el `where reporter_id = auth.uid()` de la vista es redundante con
la policy de §6.2 pero explícito, y la vista en sí **no expone `admin_notes` ni
`reviewed_by`/`reviewed_at` como columnas** — no es que estén ocultas por permiso, es
que no existen en el `select` de la vista.

**Regla de disciplina para Server Actions** (documentada aquí, aplicada en §15): el
Server Action orientado al reportante (`getMyReports()`) **siempre** consulta
`reporter_reports_view`, nunca `reports` directamente. El Server Action orientado al
admin (`getReportDetail()`, `admin-reports.ts`) consulta `reports` completo, siempre
detrás de `assertAdmin()`. Si por error el Server Action del reportante consultara la
tabla base en vez de la vista, el peor caso es que esa persona vea `admin_notes` de
**su propio** reporte (no de otros) — acotado, no una fuga cross-usuario, pero de
todos modos a evitar activamente con la disciplina de código, no solo confiando en la
vista.

### 6.4 Evidencia

```sql
alter table public.report_evidence enable row level security;

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

create policy "report_evidence_select_own_or_admin"
  on public.report_evidence for select
  using (uploaded_by = auth.uid() or public.current_user_role() = 'admin');
```

Solo se puede adjuntar evidencia mientras el reporte propio sigue en `pending` — una
vez que un admin lo toma (`under_review`), ya no se admite evidencia nueva, para que
nadie pueda alterar el material bajo revisión activa. Sin policy UPDATE ni DELETE —
la evidencia, una vez subida, es inmutable (solo un admin podría borrarla más
adelante si se agrega esa policy explícitamente, no incluido en v1).

**Archivos en sí**: nunca vía policy de `storage.objects` para lectura directa —
siempre signed URL generada server-side, igual que `getVerificationDocumentDetail()`.
Detalle completo en §8.

### 6.5 Administrador

```sql
create policy "reports_update_admin"
  on public.reports for update
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "reports_delete_admin"
  on public.reports for delete
  using (public.current_user_role() = 'admin');
```

Solo admin puede cambiar `status`, escribir `admin_notes`, fijar `reviewed_by`/
`reviewed_at`. Un usuario normal no tiene ninguna policy UPDATE que lo alcance —
ni siquiera puede intentar tocar su propio reporte después de crearlo (retractar/
editar no está en el alcance de v1, ver §19).

`moderation_actions`: **append-only**, sin policy UPDATE ni DELETE en absoluto (mismo
criterio que `verification_document_reviews`/`job_state_history`).

```sql
alter table public.moderation_actions enable row level security;

create policy "moderation_actions_select_admin"
  on public.moderation_actions for select
  using (public.current_user_role() = 'admin');

-- INSERT manual (acciones que un admin registra explícitamente, no solo
-- las que dispara el trigger de cambio de estado):
create policy "moderation_actions_insert_admin"
  on public.moderation_actions for insert
  with check (public.current_user_role() = 'admin' and admin_id = auth.uid());
```

Los inserts automáticos (por el trigger de cambio de estado) corren como
`security definer`, así que no dependen de esta policy — la policy de INSERT es
solo para el camino manual (p. ej. "advertencia emitida" sin cambio de estado
asociado).

### 6.6 Resumen de la matriz de permisos pedida

| Acción | Usuario normal | Admin |
|---|---|---|
| Crear su propio reporte | ✅ | ✅ (también puede reportar) |
| Falsificar `reporter_id` | ❌ (RLS `with check`) | — |
| Reportarse a sí mismo | ❌ (`CHECK` de tabla, ni con service role) | — |
| Leer reportes ajenos | ❌ | ✅ |
| Leer notas administrativas de su propio reporte | ❌ (vista sin esa columna) | ✅ |
| Modificar `status` | ❌ | ✅ |
| Modificar decisiones administrativas | ❌ | ✅ |
| Ver evidencia ajena | ❌ (ni siquiera metadata) | ✅ (vía signed URL) |
| Consultar `moderation_actions` | ❌ | ✅ |

---

## 7. Privacidad

### Denunciante
- Confirmación de recepción: inmediata (respuesta de la Server Action) + notificación
  `report_received` en el centro de notificaciones existente (§13).
- Puede consultar el **estado general** de su reporte (`pending`/`under_review`/
  `resolved`/`dismissed`) vía `reporter_reports_view` — nunca `admin_notes`.
- **No** ve ningún dato privado del denunciado más allá de lo que ya podía ver antes
  de reportar (perfil público) — el sistema de reportes no le da acceso nuevo a nada.

### Usuario denunciado
- **No se le notifica que fue reportado.** No hay ningún trigger, Server Action ni
  policy que le dé acceso a `reports` donde `reported_user_id = auth.uid()` — de
  hecho, deliberadamente **no existe ninguna policy SELECT para el denunciado** sobre
  la tabla `reports` (repasar §6.2: solo `reporter_id = auth.uid() or admin`).
- **No** tiene acceso a la evidencia (policy de §6.4 es `uploaded_by = auth.uid() or
  admin` — el denunciado nunca es `uploaded_by`).
- **Notificación mínima solo ante una acción administrativa con consecuencia real**
  (`warning_issued`, `temporary_suspension`, `permanent_block`,
  `account_deactivated`) — nunca ante `note_added`/`status_changed`/`no_action`.
  Texto genérico, sin mencionar al denunciante, sin citar el reporte ni el motivo
  textual exacto (que en casos de pocas interacciones podría permitir deducir quién
  denunció). Ejemplo: *"Tu cuenta recibió una advertencia por no cumplir las normas
  de la comunidad de Chamby."* — nunca *"Juan te reportó por acoso."*

### Administrador
Acceso completo, ya cubierto por `assertAdmin()` en cada Server Action (§15).

---

## 8. Evidencias — arquitectura de Storage (diseño únicamente, no se implementa)

Mismo patrón exacto que `verification-documents` (`0010_professional_profile.sql`):

```sql
-- NO ejecutar todavía — diseño de referencia
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-evidence', 'report-evidence', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "report_evidence_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'report-evidence'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
-- Sin policy SELECT de storage.objects para authenticated en absoluto —
-- toda lectura pasa por signed URL generada server-side (ver abajo), nunca
-- por .storage.download() directo del cliente.
```

**Lectura**: exclusivamente vía `createAdminClient().storage.from('report-evidence')
.createSignedUrl(path, 300)` dentro de una Server Action ya protegida por
`assertAdmin()` — idéntico a `getVerificationDocumentDetail()`
(`src/lib/actions/admin.ts`). TTL corto (5 min), nunca URL pública permanente, nunca
`public: true` en el bucket.

**Ruta de archivo**: `${reporterId}/${reportId}/${timestamp}.${ext}` — el prefijo
`${reporterId}/` es lo que la policy de INSERT usa vía `storage.foldername(name)[1]`
para garantizar que cada usuario solo pueda subir dentro de su propia carpeta, mismo
mecanismo que `verification-documents`.

---

## 9. Acciones administrativas

### v1 (a implementar en este feature)
- Abrir/ver detalle del reporte (`/admin/reports/[id]`).
- Marcar en revisión (`status → under_review`).
- Resolver (`status → resolved`).
- Descartar (`status → dismissed`).
- Agregar nota administrativa (`admin_notes`, o una fila `note_added` en
  `moderation_actions` si se prefiere historial de notas múltiples en vez de un solo
  campo — recomendado: fila en `moderation_actions`, así queda quién y cuándo agregó
  cada nota, no solo la última).
- Ver evidencia (signed URL).
- Consultar perfil del denunciado y del denunciante — **reutilizando directamente**
  `/admin/users/[id]` (ya construido esta sesión) vía un link, no una vista nueva.
- Consultar historial de reportes de ese mismo usuario reportado (`reports where
  reported_user_id = X`) y su historial de `moderation_actions`.

### Futuro (NO implementar todavía, explícitamente fuera de alcance de v1)
- **Advertencia formal** (`warning_issued`) — requiere plantilla de mensaje, no solo
  el registro en `moderation_actions`.
- **Suspensión temporal** (`temporary_suspension`) — requiere una forma real de
  bloquear acceso por tiempo limitado (columna `suspended_until` en `profiles` o
  tabla de suspensiones activas + chequeo en middleware/RLS). No existe hoy.
- **Bloqueo permanente** (`permanent_block`) / **desactivación** — **no requiere
  mecanismo nuevo**: `profiles.is_active` y `toggleUserActive()`
  (`src/lib/actions/admin.ts`, ya implementado y ya usado en `/admin/users`) ya
  hacen exactamente esto. El handler futuro de `permanent_block` debería **llamar a
  `toggleUserActive(reportedUserId, false)` directamente**, no reimplementar el
  bloqueo — y además insertar la fila en `moderation_actions` para dejar registrado
  el porqué (cosa que `toggleUserActive()` hoy no hace por sí sola). Esto es
  exactamente el "no crear un sistema paralelo innecesario" pedido en §18.

---

## 10. Historial / auditoría

`moderation_actions` (§3.4) responde *"¿por qué fue suspendido este usuario?"* con:

```sql
select * from moderation_actions
where target_user_id = $1
order by created_at desc;
```

— sin depender de que `reports.status` actual siga reflejando la decisión (podría
haberse reabierto desde entonces) ni de que el reporte original exista (`report_id`
sobrevive su borrado vía `on delete set null`). Cada fila registra: quién
(`admin_id`), qué (`action_type`), sobre quién (`target_user_id`), por qué (`reason`
+ `metadata` jsonb para detalles estructurados como `{from: 'pending', to:
'under_review'}` en los cambios de estado automáticos), y cuándo (`created_at`).

---

## 11. Integración futura con Trust Score

**Regla explícita pedida y respetada: un reporte, por sí solo, nunca reduce el trust
score.** El flujo es:

```
reporte → revisión humana → decisión administrativa (moderation_actions)
                                          │
                                          ▼ (solo en una fase futura, no v1)
                          computeAndSaveProfileStats() podría restar puntos
                          o suprimir badges si existen moderation_actions
                          de tipo warning_issued/temporary_suspension/
                          permanent_block para ese profile_id — nunca por
                          la sola existencia de una fila en `reports`.
```

Esto evita el vector de abuso obvio: alguien no puede dañar el trust score de otro
usuario con solo enviar reportes falsos — hace falta que un admin, tras revisar,
registre una acción real. No se propone ningún cambio a `computeAndSaveProfileStats()`
en este documento — queda anotado como posible fase futura, fuera del checklist de
§19.

---

## 12. Reportes maliciosos / anti-abuso

| Riesgo | Mitigación propuesta | Nivel |
|---|---|---|
| Auto-reporte | `CHECK` de tabla (§3.2) — imposible sin importar el cliente | DB |
| Duplicar el mismo reporte mientras sigue activo | Índice único parcial: `create unique index reports_no_duplicate_active on reports (reporter_id, reported_user_id, reason) where status in ('pending','under_review')` — permite reportar de nuevo tras resolución/descarte (nuevo incidente), bloquea solo la duplicación inmediata | DB |
| Spam de reportes (volumen) | Rate limit en la Server Action: máx. N reportes por `reporter_id` en 24h (propongo N=5 como punto de partida, decisión de producto a confirmar) | Server Action |
| Reportes falsos / coordinados | **No** se propone bloqueo automático (alto riesgo de falsos positivos contra usuarios legítimos) — en cambio, el panel admin muestra "N reportes contra este usuario en los últimos X días" como señal para que el humano decida | UI/admin |
| Reportar repetidamente al mismo usuario por motivos distintos | Permitido — cada motivo distinto es, potencialmente, un incidente distinto; el índice único de arriba solo actúa sobre `(reporter, reported, reason)` idéntico | — |

---

## 13. Notificaciones

Se reutiliza la tabla `notifications` existente (`0004_notifications.sql`) — su
columna `type` es `text not null` **sin** `CHECK` (confirmado leyendo el DDL), así que
agregar valores nuevos de `type` no requiere migración de esquema, solo extender el
union de TypeScript `NotificationType` (`src/lib/types.ts:138-148`) y documentar el
nuevo valor en el comentario de la columna, exactamente como ya se hizo con
`admin_alert`.

**Tipos nuevos propuestos**: `report_received`, `report_status_update`,
`moderation_action`.

| Evento | Destinatario | Tipo | Contenido |
|---|---|---|---|
| Reporte creado | Reportante | `report_received` | "Recibimos tu reporte. Nuestro equipo lo revisará." |
| `status` → `resolved`/`dismissed` | Reportante | `report_status_update` | Estado general, sin `admin_notes` |
| `status` → `under_review` | *(ninguna)* | — | Deliberadamente sin notificar — evita ruido; el reportante ya sabe que fue "recibido", no necesita cada paso intermedio |
| `moderation_actions` con `action_type` de consecuencia real | Usuario denunciado (`target_user_id`) | `moderation_action` | Mensaje genérico, sin reporte ni reportante (§7) |
| Nuevo reporte pendiente | *(ninguna notificación individual)* | — | Se prefiere un contador en vivo en `/admin/reports` (mismo patrón `StatCard` ya usado en `/admin/verifications`) en vez de una notificación por cada reporte a cada admin — evita saturar la bandeja de un admin en una beta con múltiples admins |

**Implementación** (diseño, no código): dos triggers `security definer`, mismo patrón
que `notify_document_status_changed()`:
- `notify_report_status_changed()` — `AFTER UPDATE on reports WHEN status changed` —
  inserta en `moderation_actions` (siempre) y en `notifications` (solo si el nuevo
  estado es `resolved`/`dismissed`, dirigido al `reporter_id`).
- `notify_moderation_action()` — `AFTER INSERT on moderation_actions WHEN action_type
  in (...)` — inserta en `notifications` dirigido a `target_user_id`, con texto
  genérico fijo por `action_type` (no interpolar `reason` textual del reporte).

**Riesgo de revelar identidad del denunciante**: cero por diseño — ninguna
notificación al usuario denunciado referencia `reporter_id`, `report_id`, ni el
`description` original.

---

## 14. UI

### Usuario — botón "Reportar"

| Ubicación | ¿Tiene sentido? | Razón |
|---|---|---|
| Perfil de usuario (`/workers/[workerId]`, `/employers/[id]`) | ✅ | Ya hay contexto completo de a quién se reporta |
| Tarjeta de usuario en listados | ⚠️ No recomendado para v1 | Riesgo de reportes impulsivos sin contexto suficiente; decisión de producto, no técnica |
| Conversación (`/messages/[conversationId]`) | ✅ | El abuso/acoso típicamente ocurre en el chat — alto valor |
| Oferta de trabajo (`/jobs/[id]`) | ✅ | `target_type='job'` |

Componente nuevo `src/components/reports/ReportButton.tsx` + `ReportModal.tsx` —
mismo patrón de modal que `ReportErrorButton.tsx` (botón + modal controlado por
`useState`), pero **no** reutiliza ese componente (dominio distinto, ver §1).

### Admin — `/admin/reports`

Mismo patrón visual que `/admin/verifications` (ya construido): `StatCard`s de
contadores por estado, filtros (`target_type`, `reason`, `status`), tabla con acción
"Ver detalle". Se agrega `{ href: "/admin/reports", label: "Reportes", icon: Flag }`
a `ADMIN_NAV_TABS` (`src/lib/admin-nav.ts`).

### Admin — `/admin/reports/[id]`

Mismo patrón que `/admin/verifications/[id]`: encabezado con reportante y denunciado
(cada uno con link a `/admin/users/[id]`, reutilizando la ficha ya construida),
motivo, descripción, evidencia (signed URLs), historial de `moderation_actions` de
este reporte y del usuario denunciado en general, formulario de acción (cambiar
estado + nota), igual de estructura que `VerificationReviewForm.tsx`.

---

## 15. Seguridad de Server Actions

Todas las Server Actions admin-facing (`listReports`, `getReportDetail`,
`updateReportStatus`, `recordModerationAction`) empiezan con `assertAdmin()` —
**exactamente** la misma función que ya usa cada acción de `admin.ts`, no una
reimplementación. Ver §16 para cómo se comparte esa función también con `beta.ts`.

- **IDOR**: `/admin/reports/[id]` protegida en 3 capas idénticas a `/admin/users/[id]`
  (middleware → sesión, `admin/layout.tsx` → rol, `assertAdmin()` dentro de la Server
  Action → no depende de que la UI oculte el link).
- **Bypass de UI / acceso directo a la Server Action**: cubierto por `assertAdmin()`
  en cada función exportada — no hay ninguna Server Action de este sistema que use
  `createAdminClient()` sin haber pasado primero por `assertAdmin()` (el error que
  causó el hallazgo crítico en `beta.ts`).
- **Manipulación de IDs desde el cliente**: `reporter_id` nunca se toma de un
  parámetro — siempre `auth.uid()` server-side (§6.1). `reported_user_id`/
  `reported_job_id` sí se reciben del cliente (es la esencia del feature — "a quién
  reporto"), pero **nunca se usan para autorizar**, solo para seleccionar qué fila
  crear; la autorización de quién puede reportar depende únicamente de estar
  autenticado + el `CHECK` de no auto-reporte.
- **Escalada de privilegios**: ninguna Server Action de usuario normal puede escribir
  `status`/`admin_notes`/`reviewed_by` (§6.1, `with check` lo impide incluso si el
  Server Action tuviera un bug).

---

## 16. Immediate Security Fix — `getBetaStats()` / `getBugReports()`

**Diseño de la corrección, no implementada todavía** (requiere tu autorización aparte,
ya que es un cambio a código existente fuera del alcance de "solo crear el documento").

Hoy `assertAdmin()` es una función **privada, no exportada**, definida dentro de
`src/lib/actions/admin.ts`. La corrección mínima:

1. Extraer `assertAdmin()` a un módulo compartido nuevo, `src/lib/actions/assert-admin.ts`
   — evita que `beta.ts` (dominio no relacionado con verificaciones/usuarios) tenga
   que importar de `admin.ts` para una utilidad genérica, y evita duplicar la función.
2. `admin.ts` importa `assertAdmin` desde ese módulo nuevo en vez de definirla
   localmente — cero cambio de comportamiento para las funciones que ya la usan.
3. `beta.ts` importa la misma función y la llama al inicio de `getBetaStats()` y
   `getBugReports()`:

```ts
// Diseño — NO aplicado todavía
export async function getBetaStats(): Promise<BetaStats> {
  await assertAdmin();
  const admin = createAdminClient();
  // ... resto sin cambios
}

export async function getBugReports(limit = 20): Promise<BugReport[]> {
  await assertAdmin();
  const admin = createAdminClient();
  // ... resto sin cambios
}
```

Este es el mismo patrón ya usado en cada función de `admin.ts` — cero arquitectura
nueva, solo cerrar el hueco de autorización con la función que ya existe.

---

## 17. Migraciones propuestas

Migraciones existentes van hasta `0018_fix_admin_role_switch_rls.sql` — las próximas
disponibles son **0019** y **0020**.

- **`supabase/migrations/0019_user_reports_moderation.sql`** — enums
  (`report_target_type`, `report_reason`, `report_status`), tabla `reports` + RLS +
  `reporter_reports_view`, tabla `report_evidence` + RLS, bucket de Storage
  `report-evidence` + policies.
- **`supabase/migrations/0020_moderation_actions.sql`** — enum
  `moderation_action_type`, tabla `moderation_actions` + RLS, triggers
  `notify_report_status_changed()` y `notify_moderation_action()`.

Se separan en dos (siguiendo el patrón `001X_user_reports.sql` /
`001X_moderation_actions.sql` que ya sugeriste) porque son revisables/testeables por
separado: la primera es "puede un usuario reportar de forma segura", la segunda es
"qué hace el sistema con ese reporte" — permite aprobar/mergear la primera sin esperar
a que la segunda esté lista, si se decide iterar por fases.

**No se ha ejecutado ninguna migración.** Ambos archivos son propuestas de contenido
para cuando se autorice la implementación.

---

## 18. Compatibilidad con la arquitectura existente

Revisado antes de diseñar, según lo pedido:

| Sistema existente | Cómo se integra este diseño |
|---|---|
| `profiles` / roles / multi-rol (`0001`, `0014`) | `reporter_id`/`reported_user_id` referencian `profiles(id)` directamente, igual que todo el resto del esquema. No se introduce ningún concepto de rol nuevo — la dirección del reporte (trabajador→empleador, etc.) se deriva de `profiles.role` en el momento de consulta, no se persiste. |
| `jobs` / `job_applications` | `reported_job_id`/`related_job_id` referencian `jobs(id)`. No se toca `job_applications` — un reporte no cambia el estado de una postulación. |
| `chat` (`conversations`/`messages`) | El botón "Reportar" se monta en la UI del chat, pero no hay ninguna FK a `conversations`/`messages` en `reports` — si se reporta algo dicho en un chat, el `description` en texto libre y `related_job_id` (el job del que nace esa conversación) son el contexto suficiente para v1. Se podría agregar `related_conversation_id` en una fase futura si se decide necesario. |
| `notifications` (`0004`) | Reutilizada tal cual — nuevos `type` como strings, sin migración de esquema, dos triggers nuevos siguiendo el patrón exacto ya establecido (§13). |
| `verification_documents` / Storage (`0010`, `0016`) | Fuente directa del patrón de RLS "owner-or-admin", del patrón de signed URLs, y del patrón de tabla de auditoría append-only (`verification_document_reviews` → `moderation_actions`). |
| Trust score (`computeAndSaveProfileStats`) | No se modifica en v1 — solo se documenta el punto de integración futura (§11), explícitamente diferido. |
| Admin (`admin.ts`, `assertAdmin()`, `/admin/*`) | Se reutiliza `assertAdmin()` (extraída a módulo compartido, §16), el patrón de layout/middleware de 3 capas, y **se reutiliza directamente `/admin/users/[id]`** para consultar denunciante/denunciado en vez de duplicar esa vista. |
| RLS en general | Ningún patrón nuevo — "owner-or-admin" para SELECT, `WITH CHECK` explícito para INSERT/UPDATE, append-only para auditoría: los tres ya existen en el proyecto, aquí solo se aplican a tablas nuevas. |
| Supabase Storage | Bucket privado nuevo, mismas policies que `verification-documents`, mismo mecanismo de signed URL — cero patrón nuevo. |

**No se crea ningún sistema paralelo** — cada pieza de este diseño es una aplicación
directa de un patrón que Chamby ya usa en producción para un problema análogo.

---

## 19. Checklist de implementación futura (NO ejecutar sin autorización explícita)

### Fase 1 — Seguridad
- [ ] Extraer `assertAdmin()` a `src/lib/actions/assert-admin.ts` (§16).
- [ ] Aplicar `assertAdmin()` en `getBetaStats()`/`getBugReports()` (§16, corrección
      del hallazgo crítico, independiente del resto de este feature).

### Fase 2 — Base de datos
- [ ] `0019_user_reports_moderation.sql` (enums, `reports`, `report_evidence`, RLS,
      `reporter_reports_view`, bucket `report-evidence` + storage RLS).
- [ ] `0020_moderation_actions.sql` (`moderation_actions`, RLS, triggers).
- [ ] Verificar ambas migraciones contra Postgres real antes de aprobar el merge
      (mismo estándar que el resto del proyecto — no se pudo ejecutar ninguna
      migración de esta sesión contra una base real, limitación del entorno).

### Fase 3 — Server Actions
- [ ] `src/lib/actions/reports.ts` — `submitReport()`, `getMyReports()` (vía la
      vista), `addReportEvidence()`.
- [ ] `src/lib/actions/admin-reports.ts` — `listReports()`, `getReportCounts()`,
      `getReportDetail()`, `updateReportStatus()`, `addModerationNote()`.
- [ ] `src/lib/report-config.ts` — catálogo de motivos/labels (§5).
- [ ] `src/lib/types.ts` — interfaces `Report`, `ReportEvidence`, `ModerationAction` +
      extender `Database` + extender `NotificationType`.

### Fase 4 — UI usuario
- [ ] `src/components/reports/ReportButton.tsx` + `ReportModal.tsx`.
- [ ] Montar el botón en perfil de worker/employer, conversación, y oferta de
      trabajo (§14).

### Fase 5 — Panel admin
- [ ] `src/lib/admin-nav.ts` — agregar tab "Reportes".
- [ ] `src/app/admin/reports/page.tsx` + `src/components/admin/AdminReportRow.tsx`.
- [ ] `src/app/admin/reports/[id]/page.tsx` + componentes de detalle/acción.

### Fase 6 — Evidencia
- [ ] Bucket `report-evidence` + policies de Storage.
- [ ] Flujo de subida en `ReportModal.tsx` (mismo patrón `createSignedUploadUrl` que
      ya usa `DocumentsTab.tsx`).
- [ ] Visualización de evidencia en `/admin/reports/[id]` vía signed URL.

### Fase 7 — Notificaciones
- [ ] Triggers `notify_report_status_changed()` / `notify_moderation_action()`
      (parte de `0020`).
- [ ] Confirmar en pruebas que el usuario denunciado nunca recibe una notificación
      que revele al denunciante.

### Fase 8 — QA
- [ ] `tsc --noEmit`, `next lint`, `vitest run`, `next build` en cada paso.
- [ ] Tests nuevos: `reports.test.ts`, `admin-reports.test.ts` (mismo patrón de mocks
      ya establecido en `admin.test.ts`/`roles.test.ts`).
- [ ] Casos de prueba mínimos: auto-reporte rechazado, `reporter_id` no falsificable,
      usuario no-admin no puede leer/actualizar reportes ajenos, `admin_notes` no
      visible para el reportante, notificación al denunciado sin identidad del
      denunciante.

### Fase 9 — Seguridad final
- [ ] Auditoría pre-merge (mismo formato que `docs/SECURITY_AUDIT_v0.9.md`).
- [ ] Confirmar que ningún Server Action nuevo usa `createAdminClient()` sin
      `assertAdmin()` previo.
- [ ] Confirmar RLS de las 3 tablas nuevas con pruebas contra Postgres real.

---

## 20. Qué NO incluye este diseño (a propósito)

- Sanciones automáticas basadas en cantidad de reportes — explícitamente pedido que
  no se automatice (§11, §12).
- Suspensión temporal real (requiere mecanismo de expiración que no existe hoy) —
  solo el tipo de acción queda modelado en el enum, la implementación del bloqueo
  temporal en sí es trabajo futuro separado.
- Retractar/editar un reporte propio después de creado.
- Reportar mensajes de chat individuales con FK directa (`related_conversation_id`) —
  se cubre con `related_job_id` + `description` en v1.
- Cualquier cambio a `bug_reports`, su RLS, o su panel `/admin/beta` (más allá del fix
  de seguridad independiente de §16).

---

**No se ha modificado ningún archivo de código, RLS ni migraciones.** Este documento
es la propuesta completa; queda a la espera de aprobación explícita antes de crear
`0019`/`0020`, extraer `assertAdmin()`, o tocar cualquier Server Action/componente.
