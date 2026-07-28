# Chamby — Fase 3: Centro de Notificaciones
## Documento de Diseño v1.0

**Estado:** Propuesta — pendiente de aprobación  
**Rama:** `claude/notificaciones-fase3`  
**Autor:** Claude Code  
**Fecha:** 2026-07-28  
**Prerequisito:** Fase 2 mergeada (v0.5.0) — infraestructura Realtime activa

---

## 1. Objetivo

Construir un Centro de Notificaciones que informe a los usuarios en tiempo real sobre eventos relevantes (nuevas postulaciones, aceptaciones, mensajes nuevos, calificaciones, etc.) sin abrir conexiones Supabase adicionales, reutilizando íntegramente la arquitectura Realtime establecida en la Fase 2.

**Principio rector:** una sola conexión Realtime por usuario activo, de la que se derivan tanto las notificaciones del chat como las del centro de notificaciones.

---

## 2. Eventos que generan notificaciones

| Evento | Quién recibe | Tipo |
|---|---|---|
| Nueva postulación a un trabajo | Employer | `new_application` |
| Postulación aceptada | Worker | `application_accepted` |
| Postulación rechazada | Worker | `application_rejected` |
| Postulación retirada | Employer | `application_withdrawn` |
| Trabajo completado | Worker | `job_completed` |
| Trabajo cancelado | Worker | `job_cancelled` |
| Nuevo mensaje (fuera de la conversación activa) | Otro participante | `new_message` |
| Calificación recibida | Calificado | `rating_received` |

---

## 3. Modelo de datos

### 3.1 Tabla `notifications`

```sql
create table public.notifications (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text not null,
  data       jsonb,         -- { jobId?, conversationId?, applicationId?, ... }
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_user_unread
  on public.notifications (user_id, created_at desc)
  where read_at is null;
```

**Campo `data`** por tipo:
| Tipo | Campos en `data` |
|---|---|
| `new_application` | `jobId`, `applicationId`, `workerName` |
| `application_accepted` | `jobId`, `conversationId`, `jobTitle` |
| `application_rejected` | `jobId`, `jobTitle` |
| `new_message` | `conversationId`, `senderName`, `preview` |
| `rating_received` | `jobId`, `score`, `fromName` |

### 3.2 Tabla `notification_preferences`

```sql
create table public.notification_preferences (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  in_app     boolean not null default true,
  push       boolean not null default true,
  email      boolean not null default true,
  sms        boolean not null default false,
  whatsapp   boolean not null default false,
  quiet_from time,          -- inicio horario de silencio
  quiet_to   time,          -- fin horario de silencio
  updated_at timestamptz not null default now()
);
```

### 3.3 Tabla `push_subscriptions` (Web Push / PWA)

```sql
create table public.push_subscriptions (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth_key   text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
```

### RLS

- `notifications`: SELECT/UPDATE propio (`user_id = auth.uid()`); INSERT solo service role o trigger.
- `notification_preferences`: SELECT/UPDATE propio.
- `push_subscriptions`: SELECT/INSERT/DELETE propio.
- Admins: acceso total a `notifications`.

---

## 4. Arquitectura Realtime — reutilización sin conexiones nuevas

### 4.1 Estrategia

La Fase 2 establece que cada página de chat abre un canal `conversation:{id}`.  
La Fase 3 introduce **un único canal global por usuario** para todo lo demás:

```
Canal global: user:{userId}
  └── postgres_changes → INSERT en notifications WHERE user_id = {userId}
  └── broadcast → notificaciones urgentes de baja latencia (futuro)
```

Este canal se monta **una sola vez** en un `NotificationProvider` ubicado en el layout raíz, persistiendo durante toda la sesión del usuario. No se crea un canal por página ni por conversación.

### 4.2 Relación con los canales de chat

| Canal | Ámbito | Cuándo existe |
|---|---|---|
| `conversation:{id}` | Una conversación | Mientras el usuario está en `/messages/[id]` |
| `user:{userId}` | Toda la sesión | Desde el login hasta el logout |

Los dos tipos de canal coexisten sin interferir. Supabase Realtime soporta múltiples canales por cliente; la única restricción es el coste de conexiones concurrentes, que en este diseño es siempre ≤ 2 por usuario (1 global + 0 o 1 de chat).

### 4.3 Hook `useNotifications`

Sigue exactamente el mismo patrón que `useChatRealtime`:

```typescript
// src/lib/realtime/useNotifications.ts
export function useNotifications(userId: string) {
  // Canal: user:{userId}
  // Evento: postgres_changes INSERT on notifications WHERE user_id = userId
  // Callbacks: onNotification(n: Notification) → añade a lista local
  // Estado: notifications[], unreadCount, isConnected
  // Métodos: markAllRead(), markRead(id)
  return { notifications, unreadCount, markRead, markAllRead, isConnected };
}
```

### 4.4 `NotificationProvider` (layout raíz)

```tsx
// src/components/notifications/NotificationProvider.tsx — "use client"
// Montado en src/app/layout.tsx solo si el usuario está autenticado
// Proporciona el contexto mediante React Context
// Alimenta el badge del Navbar y el panel de notificaciones
```

---

## 5. Generación de notificaciones (flujo)

```
Evento de negocio
       │
       ▼
Postgres trigger (security definer)
  └─ INSERT en public.notifications
       │
       ▼
Supabase Realtime
  └─ postgres_changes → useNotifications hook
       │
       ▼
In-app: badge + panel + toast
       │
       ▼ (asíncrono, vía Edge Function)
Dispatch externo según preferencias:
  ├─ Push (Web Push API / FCM)
  ├─ Email (Resend)
  ├─ SMS (Twilio)
  └─ WhatsApp (Twilio / Meta Business API)
```

### 5.1 Triggers Postgres por evento

Cada evento de negocio ya tiene un punto de inserción natural:

| Evento | Función trigger existente | Cambio necesario |
|---|---|---|
| Postulación aceptada | `handle_application_accepted()` | Agregar INSERT en `notifications` para el worker |
| Postulación recibida | (nuevo trigger) | `after insert on job_applications` |
| Trabajo completado | Server Action `completeJob` | Agregar llamada (o trigger) |
| Calificación recibida | Server Action `submitRating` | Agregar llamada (o trigger) |
| Nuevo mensaje | `after insert on messages` | Trigger que notifica al otro participante |

> El trigger de nuevo mensaje debe omitir la inserción en `notifications` si el destinatario tiene la conversación abierta activamente. Esto se puede detectar con un campo `last_seen_at` en `conversation_read_cursors` (ya existente).

### 5.2 Edge Function `dispatch-notification`

```
supabase/functions/dispatch-notification/index.ts

Trigger: postgres webhook on notifications INSERT
Lógica:
  1. Leer preferencias del usuario (notification_preferences)
  2. Verificar horario de silencio (quiet_from / quiet_to)
  3. Para cada canal activo (push/email/sms/whatsapp):
     - Encolar tarea (o llamar directamente al proveedor)
  4. Marcar dispatch en tabla notification_dispatches (audit)
```

La Edge Function es **opcional en la Fase 3**. Las notificaciones in-app funcionan sin ella. El dispatch externo se activa en fases posteriores integrando proveedores.

---

## 6. UX — Centro de notificaciones

### 6.1 Navbar (desktop)

- **Campana** (`BellIcon`) con badge numérico de no leídas (máximo "99+")
- Click abre un **panel dropdown** (similar a GitHub/LinkedIn)
- Panel muestra últimas 20 notificaciones con scroll

### 6.2 BottomNav (móvil)

- Badge en el ítem "Mensajes" si hay mensajes no leídos
- Badge en nuevo ítem "Notificaciones" (campana) si hay notificaciones globales no leídas

### 6.3 Panel de notificaciones

```
┌─────────────────────────────────┐
│  Notificaciones          [✓ Todo]│
├─────────────────────────────────┤
│ 🔔 Pablo García postuló a tu    │ ← no leída (fondo sutil)
│    trabajo "Repartidor"         │
│    Hace 3 min              [→]  │
├─────────────────────────────────┤
│ ✅ Tu postulación fue aceptada  │ ← leída
│    Trabajo: "Mozo eventos"      │
│    Hace 2 h                [→]  │
└─────────────────────────────────┘
```

Cada ítem:
- Avatar del actor (o icono del tipo)
- Título + cuerpo truncado
- Tiempo relativo con `date-fns/es`
- Fondo diferenciado para no leídas
- Click: marca como leída + navega al recurso (via `data.jobId`, `data.conversationId`, etc.)

### 6.4 Toast de notificación entrante

Cuando llega una notificación via Realtime mientras el usuario está en la app:
- Toast no intrusivo (esquina inferior derecha, 4 s)
- Reutiliza el `ToastProvider` ya existente en la Fase 2
- No se muestra si el usuario ya está en la pantalla relevante (ej.: si está en el chat de esa conversación, no toast de "nuevo mensaje")

---

## 7. Server Actions

| Función | Descripción |
|---|---|
| `getNotifications(cursor?)` | Lista paginada (20/página), más recientes primero |
| `markNotificationRead(id)` | Actualiza `read_at` |
| `markAllNotificationsRead()` | Bulk update por `user_id` |
| `getUnreadCount()` | Para SSR inicial del badge |
| `updateNotificationPreferences(prefs)` | Upsert en tabla de preferencias |
| `registerPushSubscription(sub)` | Guarda suscripción Web Push |
| `unregisterPushSubscription(endpoint)` | Elimina suscripción |

---

## 8. Seguridad

- **RLS estricto**: cada usuario solo ve sus propias notificaciones.
- **INSERT solo por triggers** (security definer) o service role — ningún cliente puede crear notificaciones propias.
- **Rate limiting**: máximo 100 notificaciones/hora por usuario (función Postgres similar a `check_message_rate_limit`).
- **Limpieza**: cron job o trigger que elimina notificaciones > 90 días.
- **Push subscriptions**: validar `endpoint` con URL allowlist (solo dominios conocidos de FCM/APNS/Chromium Push).

---

## 9. Performance

| Aspecto | Decisión |
|---|---|
| Canal Realtime | 1 por usuario, permanente durante la sesión |
| Carga inicial | SSR: últimas 20 notificaciones + `unreadCount` |
| Polling | Ninguno — Realtime es el canal único |
| Índice | Parcial en `notifications` por `user_id` + `created_at DESC` donde `read_at IS NULL` |
| Paginación | Cursor-based (igual que mensajes) |
| Limpieza | Notificaciones > 90 días eliminadas por trigger periódico |

---

## 10. Migraciones necesarias

Se entregará como `supabase/migrations/0004_notifications.sql`:

1. Tabla `notifications` + índice parcial unread + RLS
2. Tabla `notification_preferences` + RLS
3. Tabla `push_subscriptions` + RLS
4. Tabla `notification_dispatches` (audit de envíos externos) + RLS
5. Función `check_notification_rate_limit`
6. Triggers automáticos por evento (new_application, application_accepted, new_message, job_completed, rating_received)
7. Actualización de `handle_application_accepted()` para insertar notificación al worker

---

## 11. Archivos nuevos estimados

```
src/
├── app/
│   └── notifications/
│       └── page.tsx               # Página de historial completo (mobile-first)
├── components/
│   └── notifications/
│       ├── NotificationProvider.tsx  # Context + canal Realtime
│       ├── NotificationBell.tsx      # Campana con badge (Navbar)
│       ├── NotificationPanel.tsx     # Dropdown de notificaciones
│       ├── NotificationItem.tsx      # Ítem individual
│       └── NotificationToast.tsx     # Toast de notificación entrante
├── lib/
│   ├── actions/
│   │   └── notifications.ts          # Server Actions
│   └── realtime/
│       └── useNotifications.ts       # Hook Realtime (reutiliza patrón Fase 2)
└── supabase/
    ├── migrations/
    │   └── 0004_notifications.sql
    └── functions/
        └── dispatch-notification/
            └── index.ts              # Edge Function (opcional Fase 3, activo Fase 4+)
```

---

## 12. Lo que NO se implementa en la Fase 3

Para mantener el alcance manejable, quedan explícitamente fuera:

- Integración real con Resend, Twilio o FCM (se construye la arquitectura, no se conectan las APIs)
- Panel de configuración de preferencias (el modelo de datos existe, la UI va en Fase 4)
- Notificaciones push offline (service worker actualizado para recibirlas en background)
- Digest diario / resumen semanal por email

---

## 13. Criterios de aceptación

Antes de hacer merge de la Fase 3:

- [ ] `npm run build`, `npx tsc --noEmit`, `npm run lint` — sin errores
- [ ] El badge de notificaciones en Navbar se actualiza en tiempo real sin recargar la página
- [ ] Click en notificación marca como leída y navega al recurso correcto
- [ ] "Marcar todo como leído" vacía el badge
- [ ] El canal Realtime `user:{userId}` se cierra correctamente al logout
- [ ] Solo 1 canal adicional abierto por usuario (verificable en Supabase Dashboard → Realtime)
- [ ] RLS: un usuario no puede leer las notificaciones de otro (verificado manualmente)
- [ ] Sin notificaciones duplicadas (idempotencia de triggers)
- [ ] Funciona en móvil (BottomNav badge + toast)
- [ ] WCAG AA: campana accesible con teclado, panel con `aria-live="polite"`, `role="menu"`
- [ ] Migración `0004_notifications.sql` aplicada sin errores ni pérdida de datos

---

*Documento generado el 2026-07-28. Pendiente de aprobación antes de iniciar implementación.*
