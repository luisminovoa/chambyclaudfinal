# Changelog — Chamby

Todos los cambios notables se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).
Versionado: [Semantic Versioning](https://semver.org/lang/es/).

---

## [v0.10.0-beta] — 2026-08-06

### Sistema Multi-Rol (Worker + Employer simultáneo)

Diseño aprobado en `docs/DISENO-MULTI-ROL.md`, implementado en 4 fases (cada una con
`tsc`/`lint`/`build` limpios) más una auditoría técnica final antes del merge — ver
`docs/SECURITY_AUDIT_v0.9.md`.

#### Añadido

**Base de datos** (`supabase/migrations/0014_multi_role.sql`)
- Tabla `user_roles` — roles que un usuario posee (puede tener `worker` y `employer` a la
  vez); `profiles.role` sigue siendo el modo activo, sin cambios en ninguna de las ~23
  policies RLS preexistentes
- Backfill retroactivo de todos los usuarios existentes en la misma transacción
- RLS con doble candado: `WITH CHECK` explícito (`role in ('worker','employer')`, nunca
  `admin`) + `GRANT UPDATE (active)` a nivel de columna — `role`/`user_id` nunca escribibles
  vía `UPDATE`
- `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` que garantiza al menos un rol
  activo por usuario, incluso ante `UPDATE` multi-fila o `DELETE` por admin; exceptúa el
  cascade legítimo de borrado de cuenta
- `handle_new_user()` actualizado: también registra el rol inicial en `user_roles`

**Server Actions** (`src/lib/actions/roles.ts`)
- `getUserRoles`, `hasRole`, `getActiveRole`, `enableEmployerRole`, `switchRoleAction`

**Navegación**
- Botón "+ Publicar Chamba" en el Navbar (estilo `.btn-primary` existente) — agrega el rol
  employer si falta (conservando worker), activa el modo, y navega a `/jobs/new`
- `UserMenu` — reemplaza el link directo del avatar a `/dashboard`: Mi Perfil, Panel
  Trabajador, Panel Empleador, Publicar Chamba, Cerrar sesión
- Tab central del BottomNav (mobile) cableado al mismo flujo en vez de enlazar directo a
  `/jobs/new`
- `BackToWorkerButton` en `/dashboard/employer` — visible en todos los viewports, corrige
  que un usuario mobile que activaba employer no tenía forma de volver a worker
- `useActivateRole()` (`src/components/roles/use-activate-role.ts`) — único punto de la
  lógica "asegurar rol poseído → cambiar modo activo → navegar", reutilizado por los
  cuatro puntos de entrada de arriba

#### Corregido
- `getCurrentUserAndProfile()` expone `userRoles: UserRole[]` (aditivo)
- `/dashboard/worker/profile` ahora es accesible mientras el usuario posea el rol worker,
  sin importar el modo activo — antes se volvía inalcanzable en modo employer

#### Seguridad
Auditoría técnica final (`docs/SECURITY_AUDIT_v0.9.md`) cerró V4 (`user_roles` sin
`WITH CHECK`, heredada del intento no mergeado del PR #15) y encontró una vulnerabilidad
nueva, preexistente desde `0001`/`0006` pero nunca antes documentada:
- **V5 — escalada a `admin` vía metadata de `signUp()` directo**: `handle_new_user()`
  (`security definer`, bypasea RLS) casteaba `raw_user_meta_data.role` sin validar —
  cualquiera podía llamar a la API de Supabase Auth directamente (anon key pública) con
  `role: "admin"` y obtener control administrativo total, sin pasar por la validación Zod
  de `register()`. Cerrada: el trigger ahora solo acepta el literal `"employer"`,
  cualquier otro valor (incluido `"admin"`) colapsa a `"worker"`.
- Verificado contra Postgres 16 real: 12 bloques de prueba
  (`supabase/tests/0014_multi_role.test.sql`), incluida la condición de carrera de doble
  activación concurrente (sin corrupción, constraint `unique` la previene) y el caso
  límite de `UPDATE` multi-fila desactivando todos los roles a la vez en un solo statement.

#### Deuda técnica pendiente
Ver `docs/SECURITY_AUDIT_v0.9.md` §5 para el detalle completo — resumen: mensajes de
error genéricos en `roles.ts` (no usa el patrón `formatSupabaseError` de `profile.ts`),
query extra a `user_roles` en call sites que no la usan, código muerto
(`getActiveRole`/`hasRole`/`user_has_role`), índice redundante `idx_user_roles_user`,
"Configuración" ausente del menú de usuario (esa página no existe), responsive de tablet
no verificado en dispositivo real.

---

### Correcciones previas a este sprint

#### Corregido
- **Guardado del Perfil Profesional**: `updateProfile`/`upsertWorkerProfileDetails` (y 9
  Server Actions más de `profile.ts`) reemplazaban cualquier error de Postgres por un
  mensaje genérico sin loguear nada — imposible diagnosticar un fallo real (migración
  faltante, RLS, campo obligatorio). `src/lib/format-supabase-error.ts` (nuevo) loguea el
  error completo en consola del servidor y devuelve un mensaje específico según el código
  Postgres (`42P01` tabla/migración faltante, `42501` RLS, `23502` campo obligatorio,
  etc.), sin ocultar nunca el texto original.
- **Encabezado del perfil y tarjeta "Mi Perfil" del dashboard** mostraban `profile.category`
  en vez de `worker_profile_details.professional_title` — la pestaña Información parecía no
  sincronizar. Unificado en `getWorkerPrimaryTitle()` (`src/lib/profile-completion.ts`),
  consumido por ambos componentes, con `profile.category` como fallback si el título
  profesional está vacío.

---

## [v0.9.0-beta] — 2026-08-04

### Fase 5 — Perfil Profesional del Trabajador

Trabajado y verificado por fases (0 a 4), cada una con `tsc`/`lint`/`build` limpios
antes de avanzar, más una auditoría técnica final antes de abrir el PR
([#16](https://github.com/luisminovoa/chambyclaudfinal/pull/16), mergeado en `9789778`).
Reutiliza al máximo lo ya implementado y auditado en la rama
`claude/fix-rls-role-escalation-v1v4` (PR #15, no mergeada por traer funcionalidad
multi-rol no aprobada) — solo se portó el módulo de perfil, adaptado al modelo de
rol único (`profile.role`) de esta rama.

#### Añadido

**Base de datos** (`0010_professional_profile.sql` a `0013_harden_profile_module_rls.sql`)
- Tabla `profile_photos` — hasta 10 fotos por trabajador; índice único parcial que garantiza una sola foto marcada `is_primary`
- Tabla `verification_documents` — DNI, RUC, antecedentes policiales/penales, certificados, licencias, carnet, otro; estado `pending` / `verified` / `rejected`
- Tabla `profile_stats` — `completion_percentage`, `trust_score`, `badges[]` (cache calculado por `computeAndSaveProfileStats()`)
- Tabla `worker_profile_details` — 1:1 con `profiles`: título profesional, distrito, dirección, fecha de nacimiento, WhatsApp, disponibilidad, tarifa por hora/día, años de experiencia, idiomas, radio de trabajo
- Tabla `worker_experience` — experiencias laborales múltiples (1:N); constraints de fecha (`end_date >= start_date`, `is_current` implica `end_date` nulo)
- RLS completo en las 5 tablas (propietario, con bypass admin donde aplica)
- Buckets de Storage: `profile-images` (público, 5 MB, jpeg/png/webp) y `verification-documents` (privado, 10 MB, + PDF), con políticas RLS de `storage.objects` acotadas por carpeta de usuario
- Índices: `idx_profile_photos_profile`, `idx_profile_photos_primary` (único parcial), `idx_verification_docs_profile`, `idx_worker_experience_profile`

**Fotos** (`PhotosTab`)
- Subida vía signed upload URL de Supabase Storage + cliente admin
- Compresión automática en el navegador (máx. 1200 px, JPEG calidad 0.85) antes de subir
- Drag & drop para reordenar, marcar como principal, eliminar con confirmación inline
- Contador X/10, barra de progreso de subida

**Documentos** (`DocumentsTab`)
- Subida de DNI/RUC/antecedentes/certificados/licencias/carnet/otro (JPG/PNG/WebP/PDF, máx. 10 MB)
- Badge de estado (pendiente / verificado / rechazado); descarga vía signed URL de 1 hora
- Estructura lista para verificación por administradores (policy `docs_update_admin`)

**Experiencia laboral** (`ExperienceTab` / `ExperienceCard` / `ExperienceForm`)
- CRUD completo: agregar, editar (inline) y eliminar
- Empresa, cargo, fecha inicio/fin, checkbox "trabajo actual", descripción
- Validación de fechas server-side (inicio no futuro, fin ≥ inicio)

**Habilidades** (`SkillsSelector`)
- Autocompletado sobre un catálogo curado en código (`src/lib/skills-catalog.ts`, ~45 habilidades) — sin tabla nueva, decisión explícita para esta etapa (ver Deuda técnica)
- Sigue permitiendo texto libre; `profiles.skills` sin cambios de esquema, perfiles existentes no se ven afectados

**Página de edición** (`/dashboard/worker/profile`)
- 5 pestañas: Información, Fotos, Documentos, Experiencia, Verificación
- Barra de completitud (`ProfileCompletionBar`) que se actualiza en vivo tras cualquier acción, sin recargar la página
- Insignias de confianza: Identidad verificada, RUC activo, Profesional certificado, Perfil destacado

**Dashboard** (`DashboardProfileCard`, reemplaza la card "Mi perfil" anterior)
- Avatar, nombre, puesto, ciudad, barra de completitud (reutiliza `ProfileCompletionBar`/`profile_stats`, sin lógica duplicada), estado de verificación, conteo de fotos/documentos, años de experiencia, calificación promedio + reseñas, botón "Editar Perfil"
- Alerta si completitud < 80%; insignia "Perfil destacado" si > 90%

**Server Actions** (`src/lib/actions/profile.ts`, 19 funciones)
- Perfil base: `updateProfile`
- Fotos: `getProfilePhotos`, `createPhotoUploadUrl`, `saveProfilePhoto`, `deleteProfilePhoto`, `setPrimaryPhoto`, `reorderPhotos`
- Documentos: `getVerificationDocuments`, `createDocumentUploadUrl`, `saveVerificationDocument`, `deleteVerificationDocument`, `getDocumentDownloadUrl`
- Completitud: `computeAndSaveProfileStats`, `getProfileStats`
- Información ampliada: `getWorkerProfileDetails`, `upsertWorkerProfileDetails`
- Experiencia: `getWorkerExperience`, `addWorkerExperience`, `updateWorkerExperience`, `deleteWorkerExperience`

**Componentes nuevos**
`ProfileTabs`, `InfoTab`, `PhotosTab`, `DocumentsTab`, `ExperienceTab`, `ExperienceCard`, `ExperienceForm`, `VerificationTab`, `ProfileCompletionBar`, `SkillsSelector`, `WorkerProfileClient`, `DashboardProfileCard`

#### Corregido
- La barra de completitud no se actualizaba tras guardar/subir/eliminar sin recargar la página completa (`onStatsChange` no propagaba el nuevo % al estado de React, aunque compilaba sin error) — corregido centralizando el refresco en `refreshProfileStats()` y levantando el estado a `WorkerProfileClient`

#### Seguridad
Auditoría técnica final (previa al merge) encontró y corrigió 2 vulnerabilidades de RLS heredadas al portar el módulo — mismo patrón que V1-V4 del Sprint de Seguridad (policy `UPDATE`/`INSERT` con `USING` pero sin `WITH CHECK`):
- **`profile_photos`**: un usuario podía reescribir `storage_path`/`public_url` de una fila propia para apuntar al archivo de **otro** usuario (extraíble de su URL pública) y luego borrarlo vía el cliente admin de Storage (sin RLS) — borrado cruzado de archivos. Cerrado con privilegios de columna (`UPDATE` solo en `is_primary`/`display_order`) + validación de prefijo de ruta en `saveProfilePhoto`/`saveVerificationDocument`.
- **`profile_stats`**: un usuario podía autoasignarse directamente insignias de confianza (`identity_verified`, `top_profile`) y `trust_score=100` sin verificación real. Cerrado revocando `INSERT`/`UPDATE` directo para `authenticated`; solo el cliente admin (`computeAndSaveProfileStats`) puede escribir esta tabla.
- Verificado contra Postgres 16 real (`0013_harden_profile_module_rls.sql`): los 3 intentos de explotación quedan rechazados, los flujos legítimos siguen funcionando.

#### Deuda técnica pendiente
- `SkillsSelector` declara roles ARIA de combobox (`combobox`/`listbox`/`option`) pero no implementa navegación con flechas de teclado entre sugerencias (solo mouse; escribir el nombre completo y Enter sigue funcionando por teclado).
- Confirmación de borrado duplicada visualmente entre `PhotosTab`, `DocumentsTab` y `ExperienceCard` (patrón similar, no idéntico) — candidato a un componente `ConfirmDeleteButton` compartido en un futuro pase de UI.
- Catálogo de habilidades vive en código (`skills-catalog.ts`), no en tabla — migrar a `skill_catalog` cuando exista panel de administración para gestionarlo, sin romper perfiles existentes.
- Sin límite de cantidad en `verification_documents` (fotos sí tienen tope de 10).
- `ProfileTabs.defaultTab` es una prop opcional que ningún caller usa hoy.
- V4 (escalada vía `user_roles`/sistema multi-rol) sigue pendiente, sin relación con este módulo — ver `docs/SECURITY_AUDIT_v0.8.md`.

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
