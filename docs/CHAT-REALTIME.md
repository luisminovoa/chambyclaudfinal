# Fase 2 — Chat en tiempo real · Documento de diseño

> **Estado: PENDIENTE DE APROBACIÓN.**
> No se implementará código hasta recibir aprobación.
> Rama: `claude/chat-realtime`.

---

## 1. Arquitectura

```
┌──────────────────────────────────────────────────────┐
│                  Next.js (App Router)                │
│                                                      │
│  /jobs/[id]/chat   (Server Component, SSR)           │
│    └─ ChatWindow   (Client Component, Islands)       │
│         ├─ MessageList    ← Supabase Realtime        │
│         ├─ MessageInput   → Server Action (send)     │
│         ├─ PresenceBar    ← Supabase Presence        │
│         └─ TypingIndicator ← Supabase Broadcast      │
└─────────────────────────┬────────────────────────────┘
                          │ WebSocket (wss://)
                          ▼
               ┌──────────────────────┐
               │  Supabase Realtime   │
               │  ┌──────────────┐    │
               │  │ postgres     │    │  ← INSERT on messages
               │  │ changes      │    │
               │  ├──────────────┤    │
               │  │ presence     │    │  ← online status
               │  ├──────────────┤    │
               │  │ broadcast    │    │  ← typing indicator
               │  └──────────────┘    │
               └──────────────────────┘
                          │
               ┌──────────────────────┐
               │   Supabase Postgres  │
               │   conversations      │
               │   messages           │
               └──────────────────────┘
```

**Decisiones clave:**

- El **servidor** (SSR) carga el historial inicial de mensajes; el cliente
  solo suscribe al diff en tiempo real — no hay cold-start lento ni
  flash de contenido vacío.
- **Una única conexión WebSocket por pestaña**: el hook `useChatRealtime`
  se registra en un `RealtimeChannel` compartido y desuscribe al
  desmontar — sin pérdidas de canal.
- **Envío de mensajes por Server Action**: garantiza que RLS valide al
  servidor, no al cliente. El mensaje se optimistic-inserta en el cliente
  y se confirma/revierte según el resultado.
- **Imágenes**: cargadas a Supabase Storage (`conversation-attachments/<convId>/`),
  el mensaje guarda solo la URL firmada (TTL 1 hora); se renuevan en el
  cliente bajo demanda.
- **Ubicación**: mensaje especial `type = 'location'` con `body` en JSON
  `{ lat, lng }`. El cliente lo renderiza con un mapa estático (Mapbox
  Static Images API o equivalente — sin SDK pesado).

---

## 2. Modelo de datos

### Tablas ya existentes (de la migración 0002)

```sql
conversations (id, job_id UNIQUE, employer_id, worker_id, created_at)
messages      (id, conversation_id, sender_id, body, read_at, created_at)
```

### Columnas y tablas nuevas (migración 0003)

```sql
-- Extensión de messages: tipo de contenido y adjunto
alter table public.messages
  add column if not exists type        text    not null default 'text',
  -- 'text' | 'image' | 'location'
  add column if not exists attachment_url  text,
  -- URL pública firmada (imágenes)
  add column if not exists metadata    jsonb;
  -- { lat, lng } para type='location'; null para text/image

-- Indicadores de lectura: una fila por usuario por conversación
create table if not exists public.conversation_read_cursors (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);
```

**Índices:**

```sql
create index if not exists idx_messages_sender
  on public.messages (sender_id);

create index if not exists idx_messages_unread
  on public.messages (conversation_id, read_at)
  where read_at is null;
```

**Por qué `conversation_read_cursors` en lugar de `read_at` por mensaje:**
- Escala O(1) por usuario en lugar de O(n mensajes) para calcular el
  contador de no leídos — una sola fila por conversación por usuario.
- Alineado con la forma en que WhatsApp/Telegram implementan "last seen".

---

## 3. Eventos Realtime

| Canal | Tipo | Evento | Uso |
|---|---|---|---|
| `conversation:{convId}` | postgres_changes | `INSERT on messages` | Nuevos mensajes en tiempo real |
| `conversation:{convId}` | postgres_changes | `UPDATE on messages` | Confirmación de leído (`read_at`) |
| `presence:{convId}` | presence | `sync` / `join` / `leave` | Estado en línea / última conexión |
| `typing:{convId}` | broadcast | `typing_start` / `typing_stop` | Indicador "Escribiendo…" |

**Hook compartido (`src/lib/realtime/useChatRealtime.ts`):**

```typescript
useChatRealtime(conversationId, {
  onMessage: (msg) => void,   // nuevo mensaje
  onRead:    (msgId) => void, // mensaje leído por la otra parte
  onPresence: (state) => void, // online/offline
  onTyping:  (isTyping) => void,
})
```

El hook devuelve también `sendTypingSignal()` (debounced 1 s, con
`typing_stop` automático al silencio de 3 s) y `markRead(messageId)`.

**Por qué broadcast para typing y no postgres_changes:**
- No necesita persistencia — un typing indicator descartado no rompe nada.
- Latencia ~50 ms vs ~200-400 ms del canal postgres (WAL → decode → push).

---

## 4. Políticas RLS

### `messages` (existentes en 0002, se mantienen sin cambios)

```sql
-- Lectura: solo participantes de la conversación
"messages_select_participant" → employer_id = uid OR worker_id = uid

-- Escritura: sender debe ser participante
"messages_insert_participant" → sender_id = uid AND conversación del uid
```

### `conversation_read_cursors` (nuevas en 0003)

```sql
-- Lectura: el propio cursor o el de la contraparte (para el badge de leído)
"cursors_select_participant"  → profile_id = uid
  OR conversation_id IN (SELECT id FROM conversations
                         WHERE employer_id = uid OR worker_id = uid)

-- Upsert: solo tu propio cursor
"cursors_upsert_own"  → profile_id = uid
```

### Storage bucket `conversation-attachments`

```sql
-- Solo participantes pueden subir/leer dentro de su conversación
-- (política de bucket: path prefix = convId/, uid debe ser participante)
```

### Admin

El rol `admin` puede leer cualquier conversación y sus mensajes
(política `public.current_user_role() = 'admin'` ya aplicada en 0002).
No puede enviar mensajes como si fuera un usuario (ninguna política lo
permite — solo los participantes pueden hacer `INSERT`).

---

## 5. Flujo de mensajes

```
Usuario escribe
    │
    ├─ broadcast typing_start ──────────────────► otra pantalla muestra "Escribiendo..."
    │
Usuario envía
    │
    ├─ optimistic insert en UI (estado local, sin ID)
    │
    ├─ Server Action sendMessage(convId, body, type)
    │     └─ Supabase INSERT messages (RLS valida)
    │           └─ Realtime postgres_changes INSERT
    │                 ├─ emisor: reemplaza optimistic con fila real (ID confirmado)
    │                 └─ receptor: agrega mensaje a la lista
    │
    ├─ broadcast typing_stop (automático)
    │
    └─ [Si type='image']
          ├─ Cliente sube archivo a Storage (presigned URL generada por Server Action)
          ├─ Obtiene URL pública firmada
          └─ Server Action sendMessage(convId, url, 'image')
```

**Confirmación de lectura:**

```
Receptor abre la conversación / scrollea al último mensaje
    │
    └─ Server Action markRead(conversationId)
          ├─ UPSERT conversation_read_cursors (last_read_at = now())
          ├─ UPDATE messages SET read_at = now() WHERE read_at IS NULL AND conversation_id
          └─ broadcast 'read' al emisor → doble check mark ✓✓
```

---

## 6. Wireframes (baja fidelidad)

```
┌─────────────────────────────────────────┐
│  ← Pintura de fondo del techo (trabajo) │  ← Header con título del trabajo
│  ┌───────────────────────────────────┐  │
│  │  Ana García  🟢 En línea          │  │  ← PresenceBar
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │        [Lunes 28 de julio]        │  │  ← Separador de fecha
│  │                                   │  │
│  │  Hola, ¿a qué hora llegas? 10:32 │  │  ← Mensaje recibido (izquierda)
│  │                      Bien, 9am ✓✓│  │  ← Mensaje enviado (derecha) + leído
│  │  Perfecto, te espero 🏠   10:35  │  │
│  │                                   │  │
│  │     [📍 Ver ubicación]  10:36    │  │  ← Mensaje tipo location
│  │                                   │  │
│  │     [Escribiendo...  ···]         │  │  ← Typing indicator
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ 📎  ✏️  Escribe un mensaje...  ➤ │  │  ← Input bar
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘

Accesos al chat:
- /jobs/[id]: botón "Abrir chat" en la tarjeta del trabajo (solo en_progreso)
- /messages: lista de conversaciones activas del usuario
```

**Pantalla de lista (`/messages`):**

```
┌─────────────────────────────┐
│  Mensajes                   │
│  ─────────────────────────  │
│  [Avatar] Pintura de techo  │  ← Conversación activa
│           Ana García        │
│           Hola, ¿a qué...  ●│  ← Punto = mensaje sin leer
│  ─────────────────────────  │
│  [Avatar] Jardinería Lima   │
│           Luis Pérez         │
│           Perfecto, ya voy  │
└─────────────────────────────┘
```

---

## 7. Estrategia de escalabilidad

| Dimensión | Decisión |
|---|---|
| **Conexiones WebSocket** | Supabase maneja el pool; no gestionamos directamente. Límite de plan Free: 200 conexiones concurrentes. Pro: 500. Monitorizar antes de escalar. |
| **Historial de mensajes** | Carga incremental: SSR entrega los últimos 50 mensajes; el usuario scrollea arriba para cargar páginas anteriores (`cursor`-based pagination, `created_at DESC`). |
| **Storage de imágenes** | Límite por archivo: 5 MB (validado en cliente y servidor). URLs firmadas con TTL 1 h; el cliente renueva antes de expirar. |
| **Tabla messages** | Índice compuesto `(conversation_id, created_at)` ya creado. Si el volumen supera 10M filas, particionar por `conversation_id` con `pg_partman`. |
| **RLS performance** | La política de `messages` hace `IN (SELECT … FROM conversations)` — puede ser lenta con muchas conversaciones. Mitigación: índice en `conversations(employer_id)` y `conversations(worker_id)`. |

---

## 8. Estrategia para notificaciones push futuras (Fase 3)

El diseño del chat anticipa la Fase 3 sin implementarla:

1. **Tabla `push_subscriptions`** (se crea en Fase 3): `profile_id`, `endpoint`,
   `auth`, `p256dh`. Registrada cuando el usuario concede permiso de
   notificaciones en el navegador.

2. **Edge Function `send-push-notification`** (Fase 3): suscrita al canal
   `messages` via Supabase Webhooks (pg_net). Al recibir un `INSERT`,
   consulta si el destinatario está offline (presence) y si tiene
   `push_subscription`; si sí, llama a la Web Push API con el payload.

3. **El chat de Fase 2 no depende de Fase 3**: si no hay suscripción push,
   el mensaje llega igual cuando el usuario abre la app (Realtime o SSR).
   Las notificaciones push son una mejora progresiva.

4. **Compatibilidad Android/iOS (Fase 8)**: las mismas Edge Functions se
   reutilizan — solo cambia el transporte (FCM/APNs en lugar de Web Push).

---

## 9. Optimización de rendimiento

| Técnica | Detalle |
|---|---|
| **SSR del historial inicial** | 0 ms de flash — el HTML ya trae los mensajes renderizados |
| **Virtualización de lista** | Si la conversación supera 200 mensajes visibles, usar `@tanstack/virtual` para renderizar solo los visibles en el viewport |
| **Debounce del typing** | Señal broadcast emitida máximo 1 vez por segundo mientras el usuario escribe; `typing_stop` automático a los 3 s de silencio |
| **Optimistic UI** | El mensaje aparece inmediatamente con estado "enviando"; se confirma o revierte según la respuesta del Server Action |
| **Image lazy load** | `loading="lazy"` en imágenes del chat; `next/image` con `sizes` para servir el tamaño correcto en cada breakpoint |
| **Scroll inteligente** | Auto-scroll al fondo solo si el usuario ya estaba en el fondo; si está revisando historial, muestra un botón "↓ N mensajes nuevos" |
| **Carga incremental** | Pagination cursor-based; cada página: 50 mensajes; `IntersectionObserver` en el primer mensaje para disparar la siguiente carga |
| **Minificación de presencia** | El state de presencia solo transmite `{ online: true, last_seen }` — sin datos de perfil (se cargan en SSR) |

---

## 10. Riesgos técnicos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| WebSocket desconectado silenciosamente | Alta | Reconnect automático del cliente Supabase Realtime; indicador visual "Reconectando…" si se pierde la conexión más de 3 s |
| Mensaje duplicado (retry en error de red) | Alta | `id` del mensaje generado en el cliente (UUIDv4) con restricción `unique` en Postgres; `ON CONFLICT (id) DO NOTHING` en el insert |
| Imágenes con contenido inapropiado | Media | Validación MIME en servidor (solo `image/*`); moderación manual vía panel admin; en Fase 5 valorar integración con Content Moderation API |
| Presencia imprecisa (tab en segundo plano) | Media | `Page Visibility API` para enviar `leave` al ocultar la pestaña y `join` al volver; documentar como limitación conocida en mobile |
| RLS lenta en `messages` con muchas conversaciones | Media | Índices en `conversations(employer_id)`, `conversations(worker_id)` + `EXPLAIN ANALYZE` en staging antes de producción |
| Límite de Storage en plan Free (1 GB) | Baja | Alertas en Supabase Dashboard; política de retención: imágenes del chat eliminadas 90 días después del cierre del trabajo |
| Migración sin downtime (ALTER TABLE messages) | Baja | Columnas `nullable` con `DEFAULT`; sin backfill — retrocompatible con mensajes existentes |
| Typing broadcast desde cliente comprometido | Baja | Broadcast no persiste — no representa riesgo de seguridad de datos; en el peor caso un usuario ve "Escribiendo..." falso |

---

## Preguntas para aprobación

1. **Imágenes**: ¿5 MB por imagen es el límite correcto, o prefieres un límite menor (ej. 2 MB)?
2. **Ubicación**: ¿el mapa estático es suficiente, o quieres mapa interactivo (requiere SDK externo)?
3. **Historial**: ¿50 mensajes por página, o prefieres un número diferente?
4. **Admin**: ¿los admins solo leen conversaciones, o también pueden enviar mensajes de soporte?
5. **Retención**: ¿los mensajes y adjuntos se eliminan al cerrar el trabajo, o se conservan indefinidamente?
