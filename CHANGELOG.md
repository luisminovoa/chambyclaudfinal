# Changelog — Chamby

Todos los cambios notables se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).
Versionado: [Semantic Versioning](https://semver.org/lang/es/).

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
