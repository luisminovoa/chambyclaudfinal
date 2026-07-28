# Changelog — Chamby

Todos los cambios notables se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).
Versionado: [Semantic Versioning](https://semver.org/lang/es/).

---

## [v0.7.0-beta] — 2026-07-28

### Fase 4 — Beta Privada

#### Añadido

**Base de datos** (`supabase/migrations/0005_beta.sql`)
- Tabla `bug_reports` — reportes de errores con campos: id, user_id, route, description, browser, os, resolution, version, created_at
- RLS: INSERT permitido para usuarios autenticados; SELECT solo para admin

**Infraestructura beta**
- `src/lib/beta-config.ts` — constantes de versión, etapa y fecha de despliegue; respeta `NEXT_PUBLIC_DEPLOY_DATE` y `NEXT_PUBLIC_BUILD_SHA` para entornos de CI/CD
- `src/lib/actions/beta.ts` — `submitBugReport`, `getBetaStats`, `getBugReports`
- Tipos `BugReport` y `BetaStats` en `src/lib/types.ts`

**Badge "Beta Privada"**
- `BetaBadge` — pill de advertencia animado junto al logo en el Navbar; tooltip con versión y fecha
- Footer actualizado con `{version} · {stage} · {deployDate}`

**Botón Reportar Error** (visible en toda la aplicación)
- `ReportErrorButton` — FAB flotante (esquina inferior derecha); abre un modal con captura automática de ruta, navegador, OS, resolución, versión y hora
- `ReportErrorButtonWrapper` — wrapper servidor que inyecta `userId` sin exponer lógica al cliente

**Panel Beta Admin** (`/admin/beta`)
- 10 métricas: usuarios registrados, usuarios activos, trabajos publicados, trabajos completados, conversaciones, mensajes enviados, notificaciones, errores reportados, calificación promedio, tiempo promedio de contratación
- Listado de últimos 20 reportes de error con metadatos completos
- Nueva pestaña "Beta" en `AdminTabs`

**Guía para beta testers** (`/beta`)
- Página pública (no indexable) con 10 escenarios de prueba detallados
- Instrucciones claras para reportar errores
- Diseño mobile-first, sin requerir autenticación

#### Corregido (QA)
- `NotificationsPageClient`: los cambios de pestaña de filtro ahora filtran client-side sin re-fetch, eliminando el estado inconsistente al cambiar filtros

---

## [v0.6.0] — 2026-07-28

### Fase 3 — Centro de Notificaciones

#### Añadido

**Base de datos** (`supabase/migrations/0004_notifications.sql`)
- Tabla `notifications` — registro unificado con campos: `id`, `user_id`, `type`, `title`, `body`, `data (jsonb)`, `is_read`, `read_at`, `priority`, `channel`, `sender_id`, `job_id`, `conversation_id`, `expires_at`, `created_at`
- Tabla `notification_preferences` — preferencias por canal (in_app, push, email, sms, whatsapp), tipos silenciados y horario de silencio
- Índice parcial `idx_notifications_user_unread` para conteo O(1) de no leídas
- RLS: SELECT/UPDATE/DELETE solo para el propietario; INSERT exclusivo por triggers (`security definer`) — ningún cliente autenticado puede crear notificaciones propias
- Trigger `notify_new_application` → INSERT en `job_applications` → notifica al employer con tipo `new_application`
- Trigger `notify_application_status_changed` → UPDATE en `job_applications` → notifica al worker en aceptación (`high`) o rechazo manual (con guardia contra auto-rechazo masivo)
- Trigger `notify_new_message` → INSERT en `messages` → notifica al otro participante con nombre del emisor
- Trigger `notify_job_status_changed` → UPDATE en `jobs` a `completado` → notifica al `assigned_worker_id`
- Trigger `notify_new_rating` → INSERT en `ratings` → notifica al calificado con puntuación

**Server Actions** (`src/lib/actions/notifications.ts`)
- `getNotifications(cursor?, filter?)` — paginación cursor-based (20/página), filtros: all/unread/jobs/messages
- `getUnreadCount()` — conteo SSR para badge inicial en Navbar
- `markNotificationRead(id)` — actualiza `is_read` y `read_at`
- `markAllNotificationsRead()` — bulk update por `user_id`
- `getNotificationPreferences()` — lee preferencias del usuario
- `updateNotificationPreferences(prefs)` — upsert en tabla de preferencias
- `getMessagesUnreadCount()` — conteo de mensajes no leídos para badge en BottomNav

**Realtime Hook** (`src/lib/realtime/useNotifications.ts`)
- Canal `user:{userId}` — `postgres_changes INSERT` en `notifications`
- Estado: `notifications[]`, `unreadCount`, `isConnected`
- Métodos: `markRead(id)`, `markAllRead()`, `prependNotifications(items)`
- Callback `onNewNotification` para toasts futuros
- Máximo 2 canales Realtime por usuario (1 de chat + 1 global)

**Componentes UI**
- `NotificationItem` — ítem individual con icono por tipo, indicador de prioridad, estado leído/no leído, tiempo relativo
- `NotificationBell` — campana en Navbar con badge, panel dropdown, filtros, carga incremental, cierre por Escape/clic exterior; accesible (`aria-haspopup`, `aria-live`, `role="dialog"`)
- `NotificationsPageClient` — página completa con filtros, agrupación por fecha, carga incremental y "marcar todo como leído"
- `src/app/notifications/page.tsx` — SSR con datos iniciales para hidratación sin flash

**Navegación**
- `Navbar` — campana de notificaciones con `initialUnreadCount` desde SSR
- `BottomNav` — pasa `messagesUnreadCount` al cliente
- `BottomNavClient` — badge numérico en el tab Mensajes

#### Infraestructura preparada
- Modelo de datos preparado para push (Web Push / FCM), email (Resend), SMS y WhatsApp sin cambios de esquema
- Campo `channel` para enrutar hacia canal externo en fases posteriores
- Campo `expires_at` para notificaciones efímeras (recordatorios, OTP)

---

## [v0.5.0] — 2026-07-28

### Fase 2 — Chat en tiempo real

#### Añadido

**Base de datos** (`supabase/migrations/0003_chat_extensions.sql`)
- Columnas `type`, `attachment_url` y `metadata` en la tabla `messages` (additive, sin pérdida de datos)
- Tabla `conversation_read_cursors` — cursor de última lectura por usuario por conversación (O(1) unread count)
- Tabla `conversation_settings` — silenciar, archivar y bloquear conversaciones por usuario
- Tabla `message_audit_log` — registro inmutable de mensajes eliminados por administradores
- Función Postgres `check_message_rate_limit` — máximo 30 mensajes / 60 s por usuario por conversación
- Bucket de Storage `conversation-attachments` — privado, máximo 5 MB, solo imágenes (jpeg/png/gif/webp)
- Políticas RLS de Storage: subida solo para participantes, borrado solo para el emisor, sin SELECT (acceso exclusivo vía URLs firmadas)
- Índices de rendimiento en `messages` (sender, unread) y `conversations` (employer_id, worker_id)

**Server Actions** (`src/lib/actions/chat.ts`)
- `sendMessage` — validación de tipo, contenido, tasa de envío (RPC) e inserción
- `markRead` — upsert de cursor + actualización masiva de `read_at`
- `getMessages` — paginación cursor-based, 50 mensajes por página
- `createUploadUrl` — URL firmada de subida + URL firmada de descarga (1 año) vía service role; bucket privado
- `updateConversationSettings` — silenciar / archivar por usuario
- `blockConversation` — solo administradores
- `getConversations` — lista con último mensaje, contador de no leídos y settings
- `getConversationForChat` — datos SSR para la página de chat

**Hook Realtime** (`src/lib/realtime/useChatRealtime.ts`)
- Canal Supabase único `conversation:{id}` con `postgres_changes` (INSERT/UPDATE mensajes), Presence (online/offline) y Broadcast (indicador de escritura)
- Debounce de señal de tipeo: 1 s entre señales, auto-stop a los 3 s
- Page Visibility API: pausa el tracking de presencia al minimizar la pestaña

**Componentes** (`src/components/chat/`)
- `ChatWindow` — orquestador: UI optimista, scroll inteligente, píldora "N nuevos mensajes", banner de reconexión
- `MessageBubble` — burbujas texto / imagen / ubicación con doble check (reloj → gris → azul)
- `MessageList` — agrupación por día con `DateSeparator`, `TypingIndicator` al pie
- `MessageInput` — textarea auto-height, previsualización de imagen, compartir ubicación, subida vía URL firmada
- `PresenceBar` — avatar con punto online/offline, "Última conexión hace X" en español
- `TypingIndicator` — tres puntos animados con Framer Motion y AnimatePresence
- `DateSeparator` — "Hoy", "Ayer" o fecha formateada con `date-fns/es`
- `ConversationItem` — ítem de lista con unread badge, iconos de silencio/archivo, preview del último mensaje

**Páginas**
- `/messages` — lista SSR de conversaciones ordenadas por último mensaje, contador global de no leídos, sección de archivadas, empty state con `AntIllustration`
- `/messages/[conversationId]` — chat SSR: valida participante, carga 50 mensajes iniciales, breadcrumb de vuelta

#### Corregido
- `Permissions-Policy`: `geolocation=()` → `geolocation=(self)` para habilitar la compartición de ubicación desde el chat

---

## [v0.4.0] — 2026-07-20

### Fase 1 — Flujo de contratación completo

#### Añadido

**Base de datos** (`supabase/migrations/0002_hiring_tracking.sql`)
- Columnas `hired_at`, `completed_at`, `cancelled_at` en `jobs`
- Tabla `job_state_history` — audit trail de transiciones de estado con actor y timestamps
- Tabla `conversations` — una por trabajo, creada automáticamente al aceptar un trabajador
- Tabla `messages` — mensajes de chat (schema base)
- Trigger `handle_application_accepted` refactorizado: bloqueo `FOR UPDATE` para prevenir race conditions, guard de doble aceptación, crea conversación y registra en `job_state_history`

**Server Actions** (`src/lib/actions/jobs.ts`)
- `completeJob` — cierra trabajo en `completado`, solo employer, solo desde `en_progreso`
- `cancelJob` — cancela trabajo en `cancelado`, solo employer, solo desde `abierto`
- `withdrawApplication` — retira postulación, solo worker, solo `pendiente`

**Componentes nuevos**
- `ApplicantRow` — confirmación inline para aceptar trabajador (sin `window.confirm`)
- `JobStatusTimeline` — línea de tiempo visual con timestamps de cada etapa
- `AssignedWorkerCard` — ficha del trabajador contratado
- `JobActions` — botones "Completar" y "Cancelar" con confirmación inline
- `WithdrawButton` — retirar postulación con confirmación inline

---

## [v0.3.0] — 2026-07-10

### Páginas legales, SEO y PWA

#### Añadido
- Páginas `/terminos` y `/privacidad`
- `sitemap.xml` dinámico con trabajos abiertos
- `robots.txt`, `manifest.webmanifest`
- Service Worker (`public/sw.js`) con fallback a `/offline`
- `RegisterSW` component (solo producción)

---

## [v0.2.0] — 2026-07-05

### Panel de administración

#### Añadido
- `/admin` — métricas globales
- `/admin/users` — cambio de rol y suspensión de cuentas
- `/admin/jobs` — moderación de publicaciones
- Acción `assertAdmin()` como guard centralizado

---

## [v0.1.0] — 2026-06-25

### MVP inicial

#### Añadido
- Auth (registro / login / logout) con roles `worker` / `employer`
- `/jobs` — búsqueda con filtros por ciudad y categoría
- `/jobs/[id]` — detalle con postulación
- `/jobs/new` — publicación de trabajo
- `/dashboard/worker` y `/dashboard/employer`
- Sistema de calificaciones (1-5 estrellas + comentario)
- Navbar, BottomNav, Footer
- Design system Chamby: tokens Tailwind, componentes `.btn-*`, `AntLoader`, `AntIllustration`
- RLS completo en todas las tablas
