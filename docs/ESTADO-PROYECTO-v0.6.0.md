# Chamby — Auditoría ejecutiva y técnica completa

> **Fecha:** 29 de julio de 2026
> **Rama auditada:** `claude/chamby-mvp-redesign-glb9uc` @ `d064a4a`
> **Base de comparación:** `origin/main` @ `bc03549`
> **Alcance:** 15.941 líneas TS/TSX · 117 componentes React · 11 migraciones SQL (~1.775 líneas) · 14 Pull Requests · 13 ramas · 5 documentos de diseño
> **Método:** lectura del código fuente completo, de las 11 migraciones línea por línea (incluidas las políticas RLS columna por columna), del historial de git, de los 14 PRs vía API de GitHub y de toda la documentación. Verificación de `tsc --noEmit`, `next lint` y `next build`.
> **Naturaleza:** auditoría crítica adversarial. No es un informe de progreso. Los hallazgos de la §7 son bloqueantes para cualquier apertura pública.
>
> **Este documento no modificó ningún archivo de código, ni ejecutó migraciones, ni abrió PRs.**

---

## Nota preliminar: el proyecto no sabe qué versión es

| Fuente | Valor |
|---|---|
| `src/lib/beta-config.ts` (lo que ve el usuario en Navbar y Footer) | `v0.6.0` |
| `CHANGELOG.md` (última entrada) | `v0.7.0-beta` |
| `README.md` (título) | `v0.5.0` |
| `package.json` | `1.0.0` |
| Último tag de git | `v0.5.0` |

Cinco fuentes, cinco valores. Ninguna refleja los **5 módulos terminados y sin mergear** que viven en esta rama. Este informe adopta **v0.6.0** por ser lo que la aplicación muestra en producción, pero unificar el versionado es la primera acción de higiene pendiente: hoy, cuando un beta tester reporte un error, nadie podrá saber con certeza qué código estaba ejecutando.

---

# 1. Resumen ejecutivo

*Escrito para una reunión con inversionistas. Sin adornos.*

## Estado actual

Chamby es un marketplace peruano de trabajo temporal construido sobre Next.js 14 y Supabase. **El bucle completo del producto funciona de punta a punta**: un empleador publica una chamba, un trabajador la encuentra con ocho filtros y un score de compatibilidad, postula, el empleador lo preselecciona y lo contrata, se abre un chat en tiempo real entre ambos, el trabajo avanza por estados hasta completarse, y ambas partes se califican. Todo eso está construido, compila sin errores y se puede recorrer hoy.

Es un producto real, no un prototipo. El diseño y la identidad de marca están por encima de lo que se ve habitualmente en esta etapa.

## Nivel de madurez

**Prototipo avanzado con calidad de producción en la superficie y deudas estructurales en los cimientos.**

Lo verificable automáticamente está en verde: TypeScript estricto sin errores, ESLint sin advertencias, build de producción generando 34 rutas, responsive verificado en 6 viewports. Pero **no existe una sola prueba automatizada versionada en el repositorio**, no hay integración continua, y la capa de autorización —lo único que separa a un usuario de la base de datos— tiene tres brechas explotables desde la consola del navegador.

La madurez del producto va muy por delante de la madurez del proceso que lo sostiene.

## Qué ya funciona

- **Autenticación completa**: email/contraseña y Google OAuth con PKCE, protección de rutas en middleware, redirección segura post-login sin open redirect.
- **Ciclo completo de contratación**: publicar (asistente de 4 pasos con imágenes) → buscar (8 filtros + compatibilidad) → postular → preseleccionar → contratar (con soporte multi-vacante) → trabajar → completar → calificar.
- **Chat en tiempo real** con presencia, indicador de escritura, doble check, adjuntos de imagen en bucket privado y limitación de tasa. Es el módulo mejor construido del proyecto.
- **Centro de notificaciones in-app** con canal Realtime dedicado y 6 triggers automáticos en base de datos.
- **Sistema multi-rol**: una misma cuenta puede operar como trabajador y como empleador, con reputación separada por rol.
- **Panel administrativo** con métricas, moderación de usuarios y chambas, y panel de beta con 10 indicadores.
- **Infraestructura de producto**: PWA instalable con modo offline, SEO completo con JSON-LD `JobPosting` (elegible para Google Jobs), sitemap dinámico, design system propio con identidad de marca.

## Qué falta

1. **Pagos y escrow — 0 % construido.** No hay modelo de ingresos implementado. La plataforma no participa de la transacción económica.
2. **Verificación de identidad — no funciona.** El trabajador puede subir su DNI y sus antecedentes, la interfaz muestra insignias de "Verificado", pero **ninguna línea de código en todo el repositorio aprueba un documento**. No existe la pantalla de administración. Todo queda en `pendiente` para siempre.
3. **Notificaciones fuera de la app — 0 %.** Solo in-app. Un trabajador se entera de que lo contrataron únicamente si abre la aplicación.
4. **Pruebas automatizadas — 0 %.** Ni una.
5. **Corrección de 3 vulnerabilidades críticas** presentes desde la primera migración.

## Riesgos

**El riesgo material más serio no es técnico, es de exposición.** Chamby conecta desconocidos para que uno entre físicamente al domicilio del otro, y la aplicación exhibe insignias de "trabajador verificado" que no respaldan absolutamente nada. Ante un incidente serio, esa discrepancia entre lo que la plataforma afirma y lo que verifica es indefendible.

El segundo: **cualquier usuario puede convertirse en administrador desde la consola del navegador** (§7.1). No requiere habilidad técnica. Con acceso de administrador puede borrar la base de datos de un producto sin backups verificados.

El tercero: **nadie sabe con certeza qué esquema de base de datos corre en producción.** Once migraciones aplicadas a mano en el editor SQL de Supabase, sin registro de versión, sin entorno de staging.

## Próximos pasos

Doce semanas en cuatro fases, y las dos primeras no contienen ninguna funcionalidad nueva a propósito:

| Fase | Objetivo | Duración |
|---|---|---|
| **v0.7 — Blindaje** | Cerrar las 3 vulnerabilidades críticas con pruebas que las verifiquen + CI | 2 semanas |
| **v0.8 — Confianza** | Verificación de identidad operativa + notificaciones por WhatsApp/email | 3 semanas |
| **v0.9 — Escala** | Rendimiento, deuda técnica, staging, onboarding | 3 semanas |
| **v1.0 — Lanzamiento** | Pagos, escrow, disputas, geolocalización | 4 semanas |

## Calificación del proyecto

# **6,8 / 10**

**Justificación en una frase:** producto bien concebido y bien diseñado, con código organizado y decisiones de arquitectura acertadas, lastrado por una capa de autorización con tres agujeros y por la ausencia total de verificación automatizada — dos problemas serios pero baratos de cerrar.

Con las correcciones de la fase v0.7 aplicadas, este proyecto vale **8/10**.

---

# 2. Porcentaje de avance

**Avance global ponderado: 72 %** hacia un MVP v1.0 lanzable.

| Área | Avance | Justificación |
|---|---|---|
| **Backend (Server Actions)** | **85 %** | 11 módulos de acciones (~2.400 líneas) cubren todo el dominio. Falta rate limiting global y consistencia en las verificaciones de propiedad |
| **Frontend** | **90 %** | 117 componentes, todas las pantallas del recorrido construidas. Falta onboarding y unificar rutas duplicadas |
| **Base de datos** | **80 %** | 17 tablas + 4 vistas, relaciones correctas, triggers atómicos. Faltan índices de búsqueda, particionado y política de retención |
| **Seguridad** | **40 %** | RLS activo en el 100 % de tablas pero con 3 políticas mal delimitadas por columna. Sin CSP, sin rate limiting, PII expuesta |
| **Autenticación** | **95 %** | Email + Google OAuth con PKCE funcionando, `safeNextPath` sin open redirect, cookies gestionadas por `@supabase/ssr`. Falta recuperación de contraseña y 2FA |
| **Responsive** | **95 %** | 36/36 combinaciones ruta×viewport verificadas sin overflow. Mobile-first genuino con BottomNav y safe-area |
| **UX/UI** | **80 %** | Design system propio y marca sólida. Penaliza el onboarding inexistente y 8 filtros en móvil |
| **Realtime** | **95 %** | Presupuesto explícito de 2 canales por usuario, presencia, broadcast, Page Visibility API. Falta backoff exponencial |
| **Chat** | **95 %** | Mensajes, imágenes, ubicación, doble check, cursores de lectura, rate limiting. El bloqueo de conversaciones no funciona |
| **Notificaciones** | **55 %** | In-app completo con 6 triggers. Push, email, SMS y WhatsApp: 0 %. El esquema los contempla, la implementación no existe |
| **Admin** | **65 %** | Usuarios, chambas, métricas y beta. **Falta la revisión de documentos de verificación**, que es la pantalla que da sentido al módulo de confianza |
| **Documentación** | **70 %** | 5 documentos de diseño, CHANGELOG detallado, CLAUDE.md útil. Muy desactualizada: README describe 3 de 11 migraciones |
| **DevOps** | **20 %** | Solo `netlify.toml` con el plugin oficial. Sin CI, sin tests, sin staging, sin monitoreo, sin backups documentados, migraciones a mano |

## Ponderado por peso de negocio

| Bloque | Peso | Avance | Contribución |
|---|---|---|---|
| Autenticación y perfiles | 10 % | 95 % | 9,5 |
| Publicación y búsqueda | 15 % | 95 % | 14,3 |
| Contratación y trabajo en curso | 20 % | 90 % | 18,0 |
| Chat | 12 % | 95 % | 11,4 |
| Notificaciones | 10 % | 55 % | 5,5 |
| Reputación | 8 % | 70 % | 5,6 |
| Verificación de identidad | 10 % | 40 % | 4,0 |
| Pagos y escrow | 10 % | 0 % | 0,0 |
| Panel administrativo | 5 % | 65 % | 3,3 |
| **Total** | **100 %** | | **71,6 %** |

---

# 3. Funcionalidades terminadas

*Fechas aproximadas derivadas del historial de git y del CHANGELOG.*

| # | Funcionalidad | Estado | Fecha aprox. | Archivos principales | Dependencias | Estabilidad | Riesgo |
|---|---|---|---|---|---|---|---|
| 1 | Registro email + contraseña | 100 % | 25 jun · endurecido 28 jul | `lib/actions/auth.ts`, `components/RegisterForm.tsx` | Zod, Supabase Auth | **Alta** | Bajo |
| 2 | Login con distinción de errores | 100 % | 25 jun · 28 jul | `lib/actions/auth.ts:46`, `components/LoginForm.tsx` | Supabase Auth | **Alta** | Bajo |
| 3 | Google OAuth (PKCE) | 100 % | 28 jul (PR #14) | `app/auth/callback/route.ts`, `components/GoogleAuthButton.tsx`, `0006` | `@supabase/ssr ^0.5.2` | **Media-alta** | Bajo — corregido tras 2 iteraciones fallidas |
| 4 | Redirect `?next=` sin open redirect | 100 % | 26 jul (PR #4) | `lib/actions/auth.ts:40` | — | **Alta** | Bajo — regex rechaza `//host`, `\`, >500 chars |
| 5 | Protección de rutas server-side | 100 % | 25 jun · 28 jul | `middleware.ts`, `lib/supabase/middleware.ts` | `@supabase/ssr` | **Alta** | Bajo |
| 6 | Perfil de usuario base | 100 % | 25 jun | `0001_init.sql`, `handle_new_user()` | Trigger en `auth.users` | **Alta** | Bajo |
| 7 | Publicación de chamba (wizard 4 pasos) | 100 % | 29 jul (sin mergear) | `components/JobWizardForm.tsx`, `lib/actions/jobs.ts:313`, `0009` | Zod, Storage | **Media** | Medio — sin pruebas |
| 8 | Borradores de chamba | 100 % | 29 jul (sin mergear) | `0009` (enum `borrador`) | — | **Media** | Bajo |
| 9 | Imágenes de chamba + galería | 100 % | 29 jul (sin mergear) | `components/jobs/ImageGallery.tsx`, bucket `job-images` | Storage, URLs firmadas | **Media** | **Medio** — política de bucket permisiva (§7.14) |
| 10 | Búsqueda pública `/jobs` | 100 % | 25 jun | `app/jobs/page.tsx`, `components/SearchFilters.tsx` | — | **Alta** | **Medio** — interpolación PostgREST (§7.9) |
| 11 | Buscar Chambas (8 filtros + orden) | 100 % | 29 jul (sin mergear) | `app/dashboard/worker/jobs/page.tsx`, `components/jobs/WorkerFiltersBar.tsx` | — | **Media** | **Medio** — misma interpolación; orden por compatibilidad tope 50 filas |
| 12 | Score de compatibilidad | 100 % | 29 jul (sin mergear) | `lib/compatibility.ts` | — | **Media** | **Medio** — factor "verificado" es constante (§4.6) |
| 13 | Guardar chambas | 100 % | 29 jul (sin mergear) | `lib/actions/worker-jobs.ts`, `0010` | — | **Alta** | Bajo |
| 14 | Postulación con mensaje | 100 % | 25 jun | `components/ApplyForm.tsx`, `lib/actions/jobs.ts:225` | UNIQUE `(job_id, worker_id)` | **Alta** | Bajo |
| 15 | Retiro de postulación | 100 % | 20 jul (PR #5) | `lib/actions/jobs.ts:159`, `components/WithdrawButton.tsx` | — | **Alta** | Bajo |
| 16 | Preselección de postulantes | 100 % | 29 jul (sin mergear) | `lib/actions/applications.ts:66`, `0011` | Enum `preseleccionado` | **Media** | Medio — sin pruebas |
| 17 | Contratación multi-vacante | 100 % | 29 jul (sin mergear) | `0011` (`handle_application_accepted`), `lib/actions/applications.ts:110` | Trigger + `FOR UPDATE` | **Media** | **Alto** — lógica de carrera crítica sin una sola prueba |
| 18 | Asignaciones (ciclo de vida) | 100 % | 29 jul (sin mergear) | `components/assignments/AssignmentCard.tsx`, ambas `/assignments` | `0011` | **Media** | Medio |
| 19 | Modal de perfil del postulante | 100 % | 29 jul (sin mergear) | `components/employer/WorkerProfileModal.tsx` | `createAdminClient()` | **Media** | Bajo — verifica vínculo previo, no expone `storage_path` |
| 20 | Timeline de progreso | 100 % | 29 jul (sin mergear) | `components/ApplicationTimeline.tsx` | — | **Alta** | Bajo |
| 21 | Chat en tiempo real | 100 % | 28 jul (PR #9) | `components/chat/*` (8), `lib/realtime/useChatRealtime.ts`, `lib/actions/chat.ts` | Supabase Realtime | **Alta** | Bajo |
| 22 | Adjuntos de imagen en chat | 100 % | 28 jul (PR #9) | `lib/actions/chat.ts:144` | Bucket privado + URLs firmadas | **Alta** | Bajo |
| 23 | Compartir ubicación | 100 % | 28 jul (PR #9) | `components/chat/MessageInput.tsx` | Geolocation API, `Permissions-Policy` | **Alta** | Bajo |
| 24 | Rate limiting de mensajes | 100 % | 28 jul (PR #9) | `check_message_rate_limit()` en `0003` | — | **Alta** | Bajo — 30 msg/60 s |
| 25 | Cursores de lectura (doble check) | 100 % | 28 jul (PR #9) | `conversation_read_cursors`, `lib/actions/chat.ts:93` | — | **Alta** | Bajo |
| 26 | Centro de notificaciones in-app | 100 % | 28 jul (PR #11) | `lib/actions/notifications.ts`, `components/notifications/*`, `lib/realtime/useNotifications.ts` | 6 triggers `security definer` | **Alta** | Bajo — INSERT vedado a clientes |
| 27 | Preferencias de notificación | 100 % (esquema) | 28 jul (PR #11) | `notification_preferences` en `0004` | — | **Alta** | Bajo — sin efecto real: no hay despacho externo |
| 28 | Calificaciones 1-5 + comentario | 100 % | 25 jun | `lib/actions/ratings.ts`, `components/Rating{Form,Stars}.tsx` | UNIQUE `(job_id, rater_id, rated_id)` | **Alta** | **CRÍTICO** — `rated_id` sin validar (§7.3) |
| 29 | Reputación separada por rol | 100 % | 29 jul (sin mergear) | `0008` (vistas `worker/employer_rating_summary`) | — | **Alta** | Bajo |
| 30 | Sistema multi-rol | 100 % | 29 jul (sin mergear) | `lib/actions/roles.ts`, `components/roles/*`, `0008` | `user_roles` | **Media** | **Alto** — validado en acciones, no en RLS (§7.1) |
| 31 | Perfil profesional (fotos, bio, skills) | 100 % | 29 jul (sin mergear) | `lib/actions/profile.ts`, `components/profile/*`, `0007` | Bucket `profile-images` | **Media** | Bajo |
| 32 | Subida de documentos de verificación | 100 % | 29 jul (sin mergear) | `lib/actions/profile.ts:256`, bucket privado | — | **Media** | Bajo (la subida funciona; la aprobación no existe — §4.1) |
| 33 | `profile_stats` / trust score | 100 % | 29 jul (sin mergear) | `lib/actions/profile.ts:364` | — | **Media** | Medio — techo de 55/100 inalcanzable de superar |
| 34 | Panel admin: usuarios | 100 % | 5 jul | `app/admin/users`, `lib/actions/admin.ts` | `assertAdmin()` | **Alta** | **Alto** — el rol admin es autoasignable (§7.1) |
| 35 | Panel admin: chambas | 100 % | 5 jul | `app/admin/jobs`, `components/AdminJobRow.tsx` | `assertAdmin()` | **Alta** | Alto (mismo motivo) |
| 36 | Panel admin: métricas | 100 % | 5 jul | `app/admin/page.tsx` | — | **Alta** | Bajo |
| 37 | Panel beta (10 métricas) | 100 % | 28 jul (PR #11) | `app/admin/beta`, `lib/actions/beta.ts` | — | **Alta** | Bajo |
| 38 | Reporte de errores in-app | 100 % | 28 jul (PR #11) | `components/beta/ReportErrorButton.tsx`, `0005` | — | **Alta** | Bajo |
| 39 | Guía de beta testers `/beta` | 100 % | 28 jul (PR #11) | `app/beta/page.tsx` | — | **Alta** | Bajo |
| 40 | Badge de versión + Footer | 100 % | 28 jul (PR #11) | `lib/beta-config.ts`, `components/beta/BetaBadge.tsx` | — | **Alta** | Bajo — muestra una de 5 versiones contradictorias |
| 41 | SEO: OG, Twitter Cards, JSON-LD | 100 % | 10 jul (PR #3) | `app/layout.tsx`, `app/jobs/[id]/page.tsx` | — | **Alta** | Bajo — `JobPosting` elegible para Google Jobs |
| 42 | Sitemap dinámico + robots | 100 % | 10 jul (PR #3) | `app/{sitemap,robots}.ts` | Supabase | **Alta** | Bajo — con fallback ante caída de BD |
| 43 | PWA instalable + offline | 100 % | 10 jul (PR #3) | `public/sw.js`, `components/RegisterSW.tsx`, `app/offline` | Service Worker | **Alta** | Bajo — network-first, nunca sirve contenido viejo |
| 44 | Design system + tokens | 100 % | 26 jul (PR #1) | `tailwind.config.ts`, `globals.css`, `DESIGN_SYSTEM.md` | Tailwind, CVA | **Alta** | Bajo |
| 45 | Identidad de marca (hormiguita) | 100 % | 26 jul (PR #2) | `components/brand/*` (5) | Framer Motion | **Alta** | Bajo — **activo diferenciador real** |
| 46 | Error boundaries | 100 % | 28 jul (PR #12) | `app/error.tsx`, `app/(auth)/error.tsx`, `app/not-found.tsx` | — | **Alta** | Bajo |
| 47 | Skeletons por ruta | 100 % (parcial) | 26 jul (PR #1) | 11 `loading.tsx` de 27 rutas | — | **Alta** | Bajo — cobertura del 41 % |
| 48 | Accesibilidad AA | 100 % | 10 jul (PR #3) | Global | — | **Alta** | Bajo — contraste, skip link, `useReducedMotion` |
| 49 | Cabeceras de seguridad HTTP | 100 % (parcial) | 10 jul (PR #3) | `next.config.js` | — | **Alta** | Medio — **falta CSP** (§7.10) |
| 50 | Páginas legales | 60 % | 26 jul (PR #6) | `app/{terminos,privacidad}`, `components/LegalPage.tsx` | — | **Alta** | **Alto** — texto marcado `[PROVISIONAL]` |

**Resumen:** 47 funcionalidades al 100 %, 3 parciales. De las 47, **20 no están en `main`** — viven solo en esta rama.

---

# 4. Funcionalidades parciales

## 4.1 Verificación de identidad — 40 %

**Qué funciona.** Tabla `verification_documents` con enum de 8 tipos y 3 estados. Bucket privado `verification-documents` con RLS de solo-dueño. Subida con URL firmada, validación de tipo MIME y límite de 10 MB. Descarga con URL firmada de 1 hora. Interfaz completa en `components/profile/DocumentsTab.tsx` y `VerificationTab.tsx`. `computeAndSaveProfileStats()` asigna 45 de 100 puntos a documentos verificados.

**Qué falta.** La pantalla que aprueba un documento. Verificado por búsqueda exhaustiva sobre todo el repositorio: **ninguna línea ejecuta un `update` sobre `verification_documents.status`**. La política `docs_update_admin` existe y solo permite al admin cambiarlo — pero no existe ninguna interfaz de administración que lo haga. `/admin` tiene 4 pestañas (métricas, usuarios, chambas, beta) y ninguna es de documentos.

**Riesgos.**
- Todo documento queda en `pending` indefinidamente. La insignia "Verificado" nunca aparece para nadie.
- `trust_score` tiene un techo real de 55/100 porque los 45 puntos de documentos son inalcanzables.
- **Riesgo de exposición legal:** la interfaz comunica confianza que el sistema no respalda. En un producto que envía desconocidos al domicilio de otros, esto no es un bug cosmético.

**Prioridad: CRÍTICA.** Es la promesa central de diferenciación del producto frente a contratar por Facebook Marketplace, y hoy es una etiqueta vacía.
**Dependencia técnica:** ninguna. `getDocumentDownloadUrl()` ya existe; falta una pantalla en `/admin` y una acción `reviewDocument(id, status, motivo)` con `assertAdmin()`. Estimación: 4 días.

---

## 4.2 Notificaciones multicanal — 55 %

**Qué funciona.** Tabla `notifications` con RLS ejemplar (SELECT/UPDATE/DELETE del dueño, **sin INSERT para `authenticated`** — solo los triggers `security definer` crean notificaciones, que es el modelo correcto). 6 triggers automáticos. Canal Realtime `user:{userId}`. Campana con badge, panel desplegable, página completa con filtros y paginación por cursor. Índice parcial para conteo O(1) de no leídas.

**Qué falta.** El despacho externo. El esquema fue diseñado para push/email/SMS/WhatsApp (columnas `channel`, `expires_at`, tabla `notification_preferences` con horario de silencio), y `docs/NOTIFICACIONES-DISENO.md` especifica una Edge Function `dispatch-notification` con Resend, Twilio y FCM. **Nada de eso se implementó.** Las tablas `push_subscriptions` y `notification_dispatches` que ese documento describe tampoco existen.

**Riesgos.**
- Un trabajador solo se entera de que lo contrataron si abre la aplicación. En chambas urgentes, esto rompe la conversión: el empleador contrata, el trabajador no responde en 6 horas, el empleador cancela y se va a WhatsApp.
- La pantalla de preferencias de notificación permite al usuario configurar canales que no existen. Es una promesa incumplida visible.

**Prioridad: ALTA.** Es la funcionalidad con mayor retorno directo sobre el negocio de todo el backlog.
**Dependencia técnica:** cuenta de Resend y/o proveedor de WhatsApp Business API. Estimación: 7 días.

---

## 4.3 Bloqueo de conversaciones — 20 % (roto)

**Qué funciona.** `blockConversation()` (`lib/actions/chat.ts:219`) verifica correctamente que quien llama sea administrador.

**Qué falta.** Que haga algo. Escribe `is_blocked: true` en la fila de `conversation_settings` **del propio administrador**, no en las de los participantes. Y, verificado por búsqueda: **`is_blocked` no se lee en ninguna parte del código**. `sendMessage()` no lo consulta. Bloquear una conversación no bloquea nada.

**Riesgos.** Es la única herramienta de moderación sobre acoso en el chat. Combinada con §7.7 (cualquiera puede abrir una conversación con cualquiera), deja al producto sin defensa frente al acoso — y el chat conecta a desconocidos.

**Prioridad: ALTA.** Estimación: 1 día.

---

## 4.4 Páginas legales — 60 %

**Qué funciona.** Estructura profesional con índice navegable y anclas. `/privacidad` está alineada a la Ley N.º 29733 (responsable del tratamiento, finalidad, derechos ARCO, conservación). `/terminos` cubre las 8 secciones esperables incluyendo la posición de Chamby como intermediario tecnológico.

**Qué falta.** El texto real. Cada párrafo lleva el prefijo literal `[PROVISIONAL]`.

**Riesgos.** Sin términos válidos no hay defensa contractual en una disputa entre usuarios, y la limitación de responsabilidad —clave para un intermediario— no tiene valor.

**Prioridad: ALTA** antes de cualquier apertura pública. **Dependencia:** abogado peruano, no es problema de ingeniería.

---

## 4.5 Chat en chambas multi-vacante — 50 %

**Qué funciona.** El chat entre empleador y el primer trabajador contratado.

**Qué falta.** `conversations` tiene `UNIQUE (job_id)`. Una chamba con 5 vacantes genera **una sola conversación**. Los otros 4 contratados quedan sin canal con el empleador. El trigger `0011` usa `on conflict (job_id) do nothing`, lo que hace el problema silencioso.

**Riesgos.** Contradicción interna del producto: el módulo de contratación multi-vacante recién construido está funcionalmente incompleto porque el chat no lo acompaña.

**Prioridad: MEDIA.** Migración a `UNIQUE (job_id, worker_id)` + ajuste de `getConversations()`. Estimación: 1 día.

---

## 4.6 Score de compatibilidad — 70 %

**Qué funciona.** Algoritmo puro en TypeScript: categoría 35 + ciudad 25 + verificado 15 + completitud 15 + experiencia 10.

**Qué falta / qué está mal.**
- **Bug de semántica:** el factor "verificado" lee `profile.is_active` (`lib/compatibility.ts:32`), que significa "cuenta no suspendida" y vale `true` por defecto. **Todos los usuarios reciben esos 15 puntos siempre.** No es una señal, es una constante. `ApplicantCard` arrastra el mismo error a la insignia "Verificado" que ve el empleador.
- **Límite de escala:** el cálculo es TypeScript, no SQL, así que solo ordena lo ya traído. `page.tsx` trae 50 filas, ordena en memoria y **desactiva la paginación**. Con 500 chambas abiertas, el trabajador ordena 50 creyendo ver las más compatibles del catálogo.

**Riesgos.** Engaña activamente al empleador: le muestra un porcentaje de compatibilidad con un componente que no discrimina y una insignia de verificación falsa.

**Prioridad: ALTA** el bug de semántica (barato), **MEDIA** el porte a SQL.

---

## 4.7 Cobertura de estados de carga — 41 %

11 archivos `loading.tsx` para 27 rutas con `page.tsx`. Las rutas sin skeleton muestran una pantalla en blanco durante el SSR. **Prioridad: BAJA.**

---

# 5. Funcionalidades pendientes

## CRÍTICAS

| # | Funcionalidad | Justificación |
|---|---|---|
| C1 | Corregir RLS `profiles_update_own` | Cualquier usuario se hace administrador desde la consola del navegador y puede borrar la plataforma (§7.5). No requiere habilidad técnica |
| C2 | Verificar propiedad en `updateApplicationStatus` | Un trabajador se auto-contrata en chambas ajenas, desplazando a otros postulantes sin que el empleador lo sepa (§7.7) |
| C3 | Validar `rated_id` en `submitRating` | La reputación **es** el producto en un marketplace de confianza, y hoy es forjable a voluntad (§7.8) |
| C4 | Back-office de verificación de documentos | El módulo de confianza no puede verificar a nadie. La app afirma algo que no cumple (§4.1) |
| C5 | Restringir columnas públicas de `profiles` | Los teléfonos de todos los usuarios son legibles sin autenticación: brecha bajo Ley 29733 y regalo para scrapers (§7.9) |
| C6 | Suite de pruebas + CI | 15.941 líneas, lógica de contratación en triggers PL/pgSQL, cero pruebas. Cada módulo nuevo puede romper uno viejo sin que nadie lo note |

## ALTAS

| # | Funcionalidad | Justificación |
|---|---|---|
| A1 | Despacho de notificaciones (WhatsApp/email) | Sin esto la contratación no se cierra a tiempo; es la mayor pérdida de conversión del producto |
| A2 | Arreglar el bloqueo de conversaciones | Única herramienta anti-acoso, hoy inerte, en un producto que conecta desconocidos |
| A3 | Texto legal definitivo | Requisito para operar públicamente |
| A4 | Monitoreo de errores + logging estructurado | Hoy los fallos de producción se descubren porque un usuario los reporta |
| A5 | Rate limiting global de Server Actions | Solo el chat lo tiene. Registro, publicación y postulación son scriptables sin límite |
| A6 | Endurecer `job_state_history` y `conversations` | Audit trail forjable por el propio auditado; conversaciones no solicitadas (§7.11, §7.12) |
| A7 | Cabecera CSP | Es la cabecera que más aporta contra XSS y es justo la que falta |
| A8 | Corregir semántica de "verificado" | Hoy engaña al empleador en la decisión más importante que toma |
| A9 | Entorno de staging con su propia base | Los deploy previews escriben en la base de producción |
| A10 | Migraciones vía Supabase CLI | Nadie sabe qué esquema corre en producción |

## MEDIAS

| # | Funcionalidad | Justificación |
|---|---|---|
| M1 | Pagos y escrow | Es el modelo de ingresos, pero construirlo sobre una base insegura sería irresponsable — de ahí que no sea crítico *todavía* |
| M2 | Geolocalización con PostGIS | Diferenciador fuerte para chambas urbanas; no bloquea el lanzamiento |
| M3 | Perfil público del trabajador | Canal de adquisición orgánica vía SEO |
| M4 | Chat por asignación multi-vacante | Completa un módulo ya construido |
| M5 | Compatibilidad calculada en SQL | Necesario a partir de ~500 chambas abiertas |
| M6 | Resolver el N+1 de `getMessagesUnreadCount` | Primer cuello de botella que se sentirá con el crecimiento |
| M7 | Recuperación de contraseña | Ausente. Hoy un usuario que olvida su clave queda fuera |
| M8 | Centro de ayuda / FAQ | Reduce carga de soporte |
| M9 | Panel de moderación de reportes entre usuarios | Necesario cuando haya volumen |
| M10 | Onboarding progresivo tras el registro | Ataca la causa raíz de los perfiles vacíos |

## BAJAS

| # | Funcionalidad | Justificación |
|---|---|---|
| B1 | App móvil nativa | La PWA instalable cubre el caso de uso hoy |
| B2 | `LazyMotion` de Framer Motion | ~20 kB de ahorro; el bundle actual es aceptable |
| B3 | Regenerar tipos con `supabase gen types` | Deuda real pero sin impacto en usuarios |
| B4 | Internacionalización | Mercado objetivo monolingüe |
| B5 | Modo oscuro | Cosmético |
| B6 | Analítica de producto | Deseable, no bloqueante |
| B7 | 2FA | Sobredimensionado para el perfil de riesgo actual |

---

# 6. Arquitectura

| Apartado | Nota | Fortalezas | Debilidades |
|---|---|---|---|
| **Next.js 14** | **8/10** | Uso idiomático: Server Components por defecto (solo 52 de 117 archivos son cliente), convenciones de archivo bien aprovechadas (`sitemap.ts`, `robots.ts`, `manifest.ts`), `cache()` de React para deduplicar la consulta de perfil entre layout y página | Sigue en 14/React 18 mientras el ecosistema está en 15/19; **cero `dynamic()` y cero `Suspense`** — no hay code splitting más allá del nivel de ruta; `revalidatePath` de grano grueso en todas partes, sin `revalidateTag` |
| **Supabase** | **7/10** | Decisión acertada: Auth + Postgres + RLS + Realtime + Storage sin infraestructura que operar. Separación limpia `createClient()` / `createAdminClient()`; el service role nunca cruza al cliente | Acoplamiento total sin capa de abstracción: cambiar de proveedor implica reescribir las 11 acciones y todas las páginas. El tipo `Database` está **escrito a mano** (180 líneas) y se desincroniza en silencio |
| **Netlify** | **6/10** | `netlify.toml` mínimo y correcto con el plugin oficial; deploy previews por PR | **Dos proyectos apuntando al mismo repo** (`chambyclaudfinal` y `chamby-app`) con configuración y variables duplicadas; sin staging con base propia — los previews escriben en producción; sin pipeline que verifique antes del merge |
| **GitHub** | **5/10** | 14 PRs con descripciones ejemplares, revisables, con checklist de verificación; historial limpio | **Sin `.github/`**: cero workflows, cero plantillas de PR, cero CODEOWNERS, cero protección de rama. 13 ramas sin limpiar. Y el proceso se abandonó: 5 módulos acumulados en una rama sin PR (§12) |
| **SSR** | **8/10** | Todas las rutas dinámicas se renderizan bajo demanda, correcto porque dependen de sesión. `Promise.all` sistemático para consultas independientes | Ninguna ruta pública usa ISR: `/jobs` y `/jobs/[id]` son las indexables y podrían servirse con `revalidate: 60` |
| **Server Actions** | **6/10** | Patrón consistente: `getUser()` → validar propiedad → validar valores → mutar → `revalidatePath` → `{success}\|{error}`. Zod en formularios. Errores genéricos que no filtran internals | **La calidad no es uniforme, y ahí está el problema.** `chat.ts` y `applications.ts` verifican propiedad con rigor; `updateApplicationStatus` y `updateJobStatus` solo validan el enum. Toda acción exportada es un endpoint HTTP público: la inconsistencia es superficie de ataque, no estilo |
| **Realtime** | **9/10** | Lo mejor del proyecto. Presupuesto explícito de **2 canales por usuario** (decisión de escalabilidad consciente y documentada). `useChatRealtime` combina `postgres_changes` + Presence + Broadcast en un canal; debounce de tipeo 1 s con auto-stop a 3 s; pausa de presencia vía Page Visibility API | Sin backoff exponencial explícito ante caídas prolongadas |
| **Base de datos** | **7/10** | Ver §8 | Ver §8 |
| **RLS** | **3/10** | Habilitado en las 17 tablas sin excepción; `current_user_role()` es `security definer` y `stable`; las políticas de `notifications` son ejemplares (sin INSERT para `authenticated`) | **Tres políticas escritas pensando en *quién* toca la fila, no en *qué* puede cambiar de ella.** Ese error conceptual abre los tres agujeros críticos. La nota refleja el sistema resultante |
| **Middleware** | **7/10** | Refresco de sesión correcto con la API `getAll/setAll`; `/auth/callback` excluido del matcher para no interferir con PKCE; redirección con `?next=` | `/messages` y `/notifications` no están en `PROTECTED_PREFIXES` (mitigado con `redirect()` en la página, pero es una inconsistencia que el README documenta al revés) |
| **Cookies** | **9/10** | Gestionadas íntegramente por `@supabase/ssr`: `httpOnly`, `secure`, `sameSite`. API migrada a `getAll/setAll` en PR #14. Cero manipulación manual | El `try/catch` silencioso en `server.ts` es correcto pero podría enmascarar fallos reales de escritura |
| **Storage** | **6/10** | 4 buckets con separación público/privado bien pensada. `conversation-attachments` y `verification-documents` privados **sin política SELECT** — el acceso es exclusivamente por URL firmada generada con service role tras verificar autorización. Es el patrón correcto | `job-images` permite INSERT con solo `auth.uid() IS NOT NULL`, **sin verificar la carpeta ni la propiedad de la chamba** — a diferencia de `profile-images`, que sí valida `(storage.foldername(name))[1]`. Mismo problema en DELETE. Sin antivirus ni validación de contenido real (solo MIME declarado) |

**Arquitectura global: 7,5/10.**

---

# 7. Seguridad

> **Resumen: 3 vulnerabilidades críticas, 6 altas, 5 medias.**
> La auditoría previa (`docs/AUDITORIA.md`) concluyó "críticos: 0" porque verificó que RLS estuviera **habilitado**, no que estuviera **bien delimitado por columna**. Es el mismo error del hallazgo P3 en espejo: entonces se leyó TypeScript sin leer SQL; aquí se leyó SQL sin leerlo columna por columna.

## Calificación por punto

| Punto | Nota | Evaluación |
|---|---|---|
| **Google OAuth** | **8/10** | PKCE correcto tras PR #14. `/auth/callback` excluido del middleware para no romper el `code_verifier`. Trigger `handle_new_user` guarda `avatar_url` y usa `name` como respaldo. El callback maneja todos los casos de error en vez de redirigir silenciosamente |
| **Login** | **8/10** | Zod, mensajes que no revelan si el correo existe, distinción explícita de "email no confirmado", parsing de errores en el hash de la URL. Falta rate limiting de intentos y recuperación de contraseña |
| **Registro** | **8/10** | Mínimo 8 caracteres con feedback visual, confirmación de contraseña, `maxLength` 100 en nombre, rol restringido al enum `worker\|employer` (no se puede registrar como admin) | 
| **Cookies** | **9/10** | Delegadas por completo en `@supabase/ssr`, `httpOnly` + `secure`, API actualizada |
| **RLS** | **3/10** | 100 % de cobertura, 3 políticas críticamente mal delimitadas |
| **Triggers** | **7/10** | Todos con `security definer set search_path = public` — protección correcta contra secuestro de esquema. `FOR UPDATE` contra carreras. **Cero pruebas** sobre lógica que decide contrataciones |
| **Server Actions** | **5/10** | Patrón correcto aplicado de forma desigual; 2 acciones sin verificación de propiedad; sin rate limiting global |
| **SQL Injection** | **9/10** | Sin SQL dinámico, sin concatenación de consultas, todo vía cliente parametrizado de Supabase. Funciones con `search_path` fijado |
| **XSS** | **7/10** | React escapa por defecto; **cero `dangerouslySetInnerHTML`** en todo el repositorio; sin `eval` ni `innerHTML`. Resta la ausencia de CSP |
| **CSRF** | **9/10** | Server Actions de Next 14 verifican `Origin` automáticamente. Sin endpoints mutantes fuera de ese mecanismo. El único Route Handler (`/auth/callback`) es de lectura |
| **Headers** | **6/10** | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` presentes. **Falta CSP** y falta HSTS explícito |
| **Secrets** | **9/10** | Búsqueda exhaustiva: **cero secretos en el repositorio**. `.gitignore` cubre `.env` y `.env*.local`. `SUPABASE_SERVICE_ROLE_KEY` solo se lee en `createAdminClient()` del servidor |
| **Variables de entorno** | **7/10** | 7 variables, separación `NEXT_PUBLIC_` correcta. **Sin `.env.example`**, y `NEXT_PUBLIC_SITE_URL` se usa en 3 archivos pero no está documentada en README ni CLAUDE.md — su respaldo apunta a un dominio de Netlify que quedará obsoleto |
| **Storage** | **7/10** | Buckets privados sin SELECT, acceso solo por URL firmada. `job-images` permisivo (§7.14) |
| **Uploads** | **6/10** | Validación de MIME declarado y límite de tamaño a nivel de bucket. **Sin verificación del contenido real** (un `.exe` renombrado a `.jpg` pasa), sin antivirus. El comentario en `0003` lo anticipa como trabajo futuro pero no está |

## Vulnerabilidades

### 🔴 CRÍTICA — V1: Escalada de privilegios a administrador

**Ubicación:** `supabase/migrations/0001_init.sql:225-228`

```sql
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id or public.current_user_role() = 'admin');
```

**Explicación.** No hay cláusula `WITH CHECK` por columna. En PostgreSQL, cuando se omite en un `UPDATE`, se reutiliza el `USING` — y cambiar `role` no viola `auth.uid() = id`. La `NEXT_PUBLIC_SUPABASE_ANON_KEY` es pública por diseño (viaja en el bundle JavaScript), de modo que cualquier usuario autenticado puede ejecutar contra la API REST:

```js
await supabase.from('profiles').update({ role: 'admin' }).eq('id', miPropioId)
```

`current_user_role()` lee `profiles.role`. A partir de ese instante el atacante pasa **las 23 políticas de administrador**: borra cualquier chamba, cambia el rol de cualquiera, lee todos los reportes de error, modera conversaciones. `switchRoleAction()` valida contra `user_roles` correctamente, pero es irrelevante — el atacante no usa la Server Action, va directo al endpoint REST.

**Corolario.** La suspensión de cuentas es inútil: `is_active` vive en la misma fila. El administrador suspende, el usuario se lo revierte solo.

**Impacto:** total. **Probabilidad:** alta — es de las primeras cosas que prueba cualquiera con curiosidad técnica.

---

### 🔴 CRÍTICA — V2: Auto-contratación por el trabajador

**Ubicación:** `src/lib/actions/jobs.ts:261` combinada con `0001_init.sql:282-289`

```ts
export async function updateApplicationStatus(applicationId: string, status: string) {
  const parsedStatus = applicationStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { error: "Estado inválido." };
  const supabase = createClient();
  const { error, data } = await supabase
    .from("job_applications").update({ status: parsedStatus.data }).eq("id", applicationId)
```

**Explicación.** Valida el enum pero **no verifica quién llama**. La política `applications_update` permite `auth.uid() = worker_id`. Un trabajador invoca esta Server Action con el identificador de su propia postulación y `"aceptado"`: RLS lo autoriza, y el trigger `handle_application_accepted()` se dispara con `security definer` — lo asigna a la chamba, la pasa a `en_progreso`, rechaza en masa a los demás postulantes y abre el chat. **Todo sin que el empleador intervenga ni se entere.**

`hireWorker()` en `applications.ts` sí verifica propiedad, pero `updateApplicationStatus` sigue exportada y en uso desde `ApplicantRow` en `/jobs/[id]`.

**Impacto:** alto — corrompe el flujo central del negocio. **Probabilidad:** media-alta.

---

### 🔴 CRÍTICA — V3: Forja de reputación

**Ubicación:** `src/lib/actions/ratings.ts:7` combinada con `0001_init.sql:297-306`

```sql
create policy "ratings_insert_participant" on public.ratings for insert
  with check (
    auth.uid() = rater_id
    and (auth.uid() in (select employer_id from public.jobs where jobs.id = job_id)
         or auth.uid() in (select assigned_worker_id from public.jobs where jobs.id = job_id))
  );
```

**Explicación.** La política valida **quién califica**, nunca **a quién**. `submitRating` tampoco valida `ratedId` contra los participantes de la chamba, ni exige `status = 'completado'`. Consecuencia: cualquiera publica una chamba propia —gratis, y por ser suya pasa el `with check`— y escribe una calificación de 1 a 5 estrellas contra **cualquier perfil de la plataforma**. La restricción `UNIQUE (job_id, rater_id, rated_id)` limita a una calificación por chamba, pero las chambas son ilimitadas. También es posible auto-calificarse con 5 estrellas.

**Impacto:** el mayor sobre el negocio de las tres. En un marketplace de confianza, la reputación es el producto. **Probabilidad:** media.

---

### 🟠 ALTA — V4: Exposición de datos personales

`0001_init.sql:220-223` — `create policy "profiles_select_all" ... using (true)`. La tabla `profiles` incluye `phone`, y la política permite SELECT **sin autenticación alguna**. Con la anon key pública, un script vuelca la tabla completa: nombres, teléfonos, ciudades y oficios de todos los usuarios. Bajo la Ley N.º 29733 esto es una brecha notificable; comercialmente es un regalo para competidores y spammers.

### 🟠 ALTA — V5: Ausencia total de pruebas y CI

Sin runner en `package.json`, sin `.github/`, sin gate de merge, sin protección de rama. Cinco módulos con lógica de contratación se integran sobre la palabra de que `npm run build` pasó en local. Las "37 pruebas Playwright" que menciona el PR #12 se ejecutaron ad-hoc y **no se versionaron**: no son reproducibles ni protegen contra regresiones.

### 🟠 ALTA — V6: Audit trail forjable

`history_insert_participant` (`0002:110-116`) solo comprueba `actor_id = auth.uid()`. Cualquier usuario inserta entradas arbitrarias en `job_state_history` para cualquier chamba. Un registro de auditoría que el auditado puede escribir no es un registro de auditoría.

### 🟠 ALTA — V7: Conversaciones no solicitadas

`conversations_insert_employer` (`0002:132-138`) solo exige `employer_id = auth.uid()`. Un usuario crea una conversación consigo mismo como empleador y **cualquier `worker_id`**, sin que exista chamba ni contratación, y le escribe. Vector directo de spam y acoso, agravado porque el bloqueo no funciona (§4.3).

### 🟠 ALTA — V8: Moderación de chat inoperante

Ver §4.3.

### 🟠 ALTA — V9: Sin rate limiting fuera del chat

Registro, publicación de chambas, postulación y calificación no tienen límite alguno. Un script crea miles de cuentas, publica miles de chambas o postula a todo el catálogo. Combinado con V3, permite forjar reputación a escala industrial.

### 🟡 MEDIA — V10: Inyección de filtros PostgREST

`app/jobs/page.tsx:37` y `app/dashboard/worker/jobs/page.tsx:58` interpolan la búsqueda del usuario directamente en la cadena de filtro:

```ts
query.or(`title.ilike.%${q}%,description.ilike.%${q}%,category.ilike.%${q}%`)
```

No es inyección SQL —PostgREST parametriza— pero comas y paréntesis en `q` alteran la estructura del filtro: se pueden inyectar condiciones OR adicionales sobre columnas de `jobs` o provocar errores 400 sistemáticos. El `.eq("status","abierto")` se combina con AND y no puede evadirse, lo que acota la severidad a media.

### 🟡 MEDIA — V11: Sin Content-Security-Policy

`next.config.js` define cuatro cabeceras de seguridad, pero **no CSP** — la que más aporta contra XSS.

### 🟡 MEDIA — V12: Bucket `job-images` permisivo

`0009:74-82`: INSERT y DELETE permitidos con solo `auth.uid() IS NOT NULL`, sin verificar carpeta ni propiedad de la chamba. Cualquier autenticado escribe o borra imágenes de cualquier chamba ajena.

### 🟡 MEDIA — V13: Uploads sin validación de contenido

Solo se valida el MIME declarado por el cliente y el tamaño. Sin comprobación de firma de archivo ni antivirus.

### 🟡 MEDIA — V14: `notify_assignment_status_changed` depende de `auth.uid()`

En la rama de cancelación (`0011`), el trigger usa `auth.uid()` para decidir a quién notificar. Si se dispara desde un contexto sin JWT (tarea programada, corrección manual, migración), notificará a la persona equivocada.

**Seguridad global: 4/10.** Los fundamentos están bien elegidos —RLS en todo, `security definer` con `search_path`, service role aislado, CSRF nativo, cero secretos, cero `dangerouslySetInnerHTML`—. La ejecución de la capa de autorización tiene tres brechas que comprometen el sistema entero.

---

# 8. Base de datos

## Tablas — 17 + 4 vistas

`profiles` · `jobs` · `job_images` · `job_applications` · `job_assignments` · `saved_jobs` · `job_state_history` · `conversations` · `messages` · `conversation_read_cursors` · `conversation_settings` · `message_audit_log` · `notifications` · `notification_preferences` · `ratings` · `user_roles` · `profile_photos` · `verification_documents` · `profile_stats` · `bug_reports`.

Vistas: `rating_summary`, `worker_rating_summary`, `employer_rating_summary`.

**Evaluación: 8/10.** Modelo normalizado, nombres claros en español consistentes con el dominio, sin campos redundantes salvo el caso heredado que se comenta abajo.

## Índices — 7/10

**Presentes y bien elegidos:** `jobs` (city, category, status, employer) · `job_applications` (job, worker) · `messages` (conversación+fecha, sender, **índice parcial** de no leídos) · `notifications` (usuario+fecha, **índice parcial** de no leídas) · `job_assignments` (job, worker, employer) · `saved_jobs` · `job_state_history` · `conversations` (employer, worker) · `profile_photos` (**índice único parcial** para foto principal).

El uso de índices parciales es una técnica que poca gente aplica y aquí está bien usada tres veces.

**Faltan:**
- Índice compuesto `(status, created_at desc)` en `jobs` — es exactamente el patrón de la consulta de listado más frecuente del producto.
- Índice trigram (`pg_trgm`) para los `ILIKE %texto%` de la búsqueda, que hoy provocan escaneo secuencial completo.
- Índice en `ratings(job_id)` — hay uno en `rated_id` pero no en `job_id`.
- Índice en `message_audit_log(message_id)`.

## Relaciones — 8/10

Claves foráneas correctas con `on delete cascade` donde corresponde y `set null` donde borrar en cascada perdería historia (`assigned_worker_id`, `bug_reports.user_id`). Restricciones `UNIQUE` bien puestas: `(job_id, worker_id)` en postulaciones y asignaciones, `(job_id, rater_id, rated_id)` en calificaciones, `(user_id, role)` en roles.

**Problemas:**
- `UNIQUE (job_id)` en `conversations` bloquea el chat multi-vacante (§4.5).
- **`jobs.assigned_worker_id` es una columna heredada** del modelo de un solo trabajador y ahora convive con `job_assignments` como fuente real. Dos fuentes de verdad para el mismo hecho terminan siempre en contradicción. Se conserva porque varias políticas RLS dependen de ella (`history_select_participant`, `ratings_insert_participant`), lo que convierte su eliminación en un cambio con ramificaciones.

## Triggers — 7/10

**Fortalezas.** `handle_application_accepted()` es el corazón del sistema y está bien construido: bloqueo `FOR UPDATE` contra condiciones de carrera, guarda de vacantes que lanza excepción (y por tanto revierte toda la transacción), atomicidad en la creación de conversación e historial. Los 6 triggers de notificación son `security definer`, lo que garantiza que ningún cliente pueda fabricar notificaciones. `handle_new_user()` tiene `on conflict do nothing` como red de seguridad. **Todas** las funciones fijan `search_path = public`, protección correcta contra secuestro de esquema.

**Debilidades.**
- **Ninguno tiene pruebas.** Un trigger que decide contrataciones, rechaza postulantes en masa y abre canales de comunicación, sin una sola prueba, es el riesgo técnico más concreto del proyecto.
- La función se ha redefinido **tres veces** (`0001` → `0002` → `0011`), cada vez con semántica distinta. Sin pruebas de regresión, cada redefinición es una apuesta.
- V14: dependencia de `auth.uid()` dentro de un trigger.

## Enums — 8/10

`user_role` · `job_status` (5 valores) · `application_status` (5) · `pay_type` · `document_type` (8) · `document_status` · `assignment_status` (5). Bien modelados y extendidos aditivamente con `ADD VALUE IF NOT EXISTS`.

**Reparo:** los valores de enum en PostgreSQL no se pueden eliminar ni reordenar. `preseleccionado` se añadió con `AFTER 'pendiente'`, lo cual es correcto, pero conviene tener presente que cada valor añadido es permanente.

## Escalabilidad — 6/10

Sin particionado, sin política de retención. `messages` y `notifications` crecen indefinidamente; el comentario final de `0004` propone borrar notificaciones de más de 90 días con un cron externo, pero **no está implementado**. Sin réplicas de lectura ni pooler de conexiones configurado — en el plan básico de Supabase, el SSR con muchos usuarios concurrentes agota las conexiones.

## Integridad — 7/10

Restricciones `CHECK` presentes donde importan (`score between 1 and 5`, `urgency in ('normal','urgente')`). Claves foráneas completas.

**Huecos:** nada impide `pay_amount` negativo; nada impide `positions_needed = 0` (el código usa `greatest(x,1)` como parche); `ratings.rated_id` no tiene restricción que lo vincule a los participantes de la chamba (raíz de V3).

## Migraciones e historial — 5/10

Once archivos, **todos aditivos** — sin una sola operación destructiva en todo el historial, lo cual es notable y facilita las reversiones.

**Pero el proceso operativo es el punto más débil de todo el proyecto:** `README.md` y todos los PRs instruyen aplicarlas **a mano en el SQL Editor de Supabase**. No hay `supabase/config.toml`, ni `db push`, ni tabla de versiones aplicadas, ni entorno de staging. **Nadie puede afirmar con certeza qué esquema está corriendo en producción.**

## Problemas futuros previsibles

| # | Problema | Cuándo se manifestará |
|---|---|---|
| 1 | `ILIKE %texto%` sin trigram → escaneo secuencial | ~5.000 chambas |
| 2 | `messages` sin particionado ni retención | ~1M mensajes |
| 3 | `notifications` sin retención | ~6 meses de operación |
| 4 | Agotamiento del pool de conexiones | ~500 usuarios concurrentes |
| 5 | Divergencia `assigned_worker_id` vs `job_assignments` | En cuanto haya chambas multi-vacante reales |
| 6 | Deriva de esquema entre entornos | En el próximo despliegue que asuma una migración no aplicada |
| 7 | Vistas de rating recalculando `avg()` sobre toda la tabla | ~100.000 calificaciones |

---

# 9. Código

| Apartado | Nota | Evaluación |
|---|---|---|
| **Organización** | **9/10** | Estructura ejemplar y predecible: `app/` por rutas, `components/` agrupados por dominio (`chat/`, `brand/`, `ui/`, `profile/`, `roles/`, `jobs/`, `employer/`, `assignments/`, `notifications/`, `beta/`), `lib/actions/` una acción por dominio, `lib/realtime/` para hooks, `lib/supabase/` para los tres clientes. Cualquiera encuentra dónde va algo sin preguntar |
| **Legibilidad** | **8/10** | Nomenclatura en español consistente con el dominio; funciones cortas; comentarios que explican **por qué** y no qué. El comentario sobre `Relationships: []` en `types.ts` documenta un comportamiento no obvio de supabase-js que ahorra horas de depuración |
| **Reutilización** | **7/10** | `EmptyState`, `Badge`, `StatCard`, `Avatar`, `Skeleton` y `Reveal` son primitivas bien diseñadas y efectivamente reutilizadas. El `AssignmentCard` con prop `viewer` para servir a dos roles es buena factorización |
| **Componentes** | **8/10** | 117 archivos con buena separación servidor/cliente: solo 52 (44 %) son cliente, y `"use client"` está empujado a las hojas del árbol. Reparo: `ChatWindow` y `JobWizardForm` concentran demasiada responsabilidad |
| **Duplicación** | **6/10** | Cuatro casos reales: (a) **gestión de postulantes duplicada** — `ApplicantRow` y `ApplicantCard` hacen lo mismo con criterios de seguridad distintos, y el primero usa la ruta insegura de V2; (b) **detalle de chamba duplicado** — `/jobs/[id]` y `/dashboard/worker/jobs/[id]`; (c) el preámbulo `createClient()` + `getUser()` + guarda se repite en ~40 acciones; (d) la consulta de resumen de calificaciones se replica en 5 páginas |
| **Deuda técnica** | **6/10** | Ver tabla abajo |
| **Arquitectura del código** | **7/10** | Separación de capas correcta, pero la lógica de negocio vive repartida entre triggers PL/pgSQL y Server Actions **sin un criterio explícito de qué va dónde**. `CLAUDE.md` documenta que existe la división, no cuándo aplicar cada lado |
| **Escalabilidad del código** | **7/10** | La estructura por dominio escala bien a más módulos. El límite es el tipo `Database` a mano: cada tabla nueva exige mantenerlo sincronizado manualmente |
| **Mantenibilidad** | **6/10** | `strict: true` sin `any` sueltos y buena documentación arquitectónica. Pero **más de 40 `as unknown as T`** —consecuencia del tipo a mano— y cero pruebas: mantener este código exige recordar todo el sistema. No escala a un segundo desarrollador |

## Inventario de deuda técnica

| Deuda | Gravedad | Coste de arreglo |
|---|---|---|
| Cero pruebas automatizadas | **Crítica** | 2 semanas |
| Tipo `Database` a mano + 40 casts `as unknown as` | Alta | 2 días |
| `ApplicantRow` / `ApplicantCard` duplicados con seguridad distinta | Alta | 1 día |
| Migraciones aplicadas a mano sin registro | Alta | 3 días |
| Dos rutas de detalle de chamba solapadas | Media | 2 días |
| Cinco versiones contradictorias del producto | Media | 1 hora |
| README con 3 de 11 migraciones; roadmap que ignora 5 módulos | Media | 3 horas |
| `NOTIFICACIONES-DISENO.md` especifica tablas nunca creadas | Media | 1 hora |
| `jobs.assigned_worker_id` como segunda fuente de verdad | Media | 3 días |
| Preámbulo de autenticación repetido 40 veces | Baja | 4 horas |
| 13 ramas sin limpiar | Baja | 10 min |
| Sin `.env.example` y `NEXT_PUBLIC_SITE_URL` indocumentada | Baja | 15 min |

**Código global: 7,5/10.** Código de buen nivel, escrito con criterio y bien organizado. Lo que lo separa de un 9 no es el estilo sino la ausencia de red de seguridad: sin pruebas y con 40 casts que anulan al compilador, la calidad depende enteramente de que quien edite recuerde el contexto completo.

---

# 10. UX / UI

| Apartado | Nota | Evaluación |
|---|---|---|
| **Responsive** | **9/10** | 36/36 combinaciones ruta×viewport (320/360/393/768/1366/1920 px) sin overflow horizontal ni errores de hidratación. Mobile-first genuino: BottomNav de 5 pestañas, safe-area para iOS, botón flotante central de publicar. Decisión correcta para un público predominantemente móvil |
| **Diseño** | **9/10** | Design system coherente: tokens en `tailwind.config.ts`, clases `.btn-*`/`.card`/`.input` en `globals.css`, documentado en `DESIGN_SYSTEM.md`. Jerarquía tipográfica sólida con Inter vía `next/font`. Animaciones de 200 ms con Framer Motion |
| **Branding** | **10/10** | **El activo más valioso del proyecto.** La hormiguita no es un logo pegado: es un lenguaje visual completo. `AntLoader` camina sobre una línea punteada en lugar de ser un spinner genérico; `AntIllustration` tiene 6 poses contextuales; los copys tienen voz propia ("La hormiguita todavía no encontró ninguna chamba"). Para un marketplace peruano de trabajo temporal, este nivel de identidad es ventaja competitiva real y difícil de copiar |
| **Accesibilidad** | **7/10** | Contraste AA verificado y corregido, skip link con landmark, `aria-*` en 56 de 72 componentes, `useReducedMotion` respetado, targets táctiles de 44 px, focus visible global. **Falta:** el `WorkerProfileModal` cierra con Escape y bloquea el scroll pero **no atrapa el foco ni lo devuelve al disparador** — un usuario de teclado se pierde; `ApplicationTimeline` es un `<ol>` sin `aria-current`; ningún flujo probado con lector de pantalla real |
| **Facilidad de uso** | **8/10** | El wizard de publicación en 4 pasos con vista previa es excelente. Confirmaciones inline en lugar de `window.confirm`. Estados vacíos que orientan en vez de frustrar. **Fricción:** 8 filtros más orden es demasiado para móvil, y el orden se aplica solo mientras los demás exigen pulsar "Buscar" — expectativa rota |
| **Onboarding** | **4/10** | **El punto más débil de la experiencia.** Tras registrarse, el usuario cae en un dashboard vacío sin ninguna guía. No hay tour, ni checklist, ni sugerencia de completar el perfil. Para el trabajador es grave: su compatibilidad y su credibilidad dependen de un perfil que nadie le pide llenar. `ProfileCompletionBar` existe pero está enterrado en `/dashboard/worker/profile`, donde solo llega quien ya sabe que existe |
| **Experiencia del trabajador** | **7,5/10** | Buscar es potente (8 filtros, compatibilidad, guardar). Postular es de un clic. El timeline de progreso comunica bien el estado. **Pero:** sin onboarding llega con perfil vacío y baja compatibilidad; sin notificaciones externas no se entera de que lo contrataron; ve una insignia de "Verificado" que nunca podrá obtener |
| **Experiencia del empleador** | **8/10** | Publicar es la mejor pantalla del producto. La gestión de postulantes con compatibilidad, nivel Chamby, insignias y modal de perfil es rica y decide bien. **Pero:** las insignias que usa para decidir son falsas (§4.6), y la confirmación de contratación —la decisión de mayor consecuencia del producto— es una franja inline discreta |

## Mejoras propuestas

| # | Mejora | Impacto | Esfuerzo |
|---|---|---|---|
| 1 | **Onboarding progresivo tras el registro**: 3 pasos (foto → oficio y habilidades → ciudad) con barra de progreso | **Alto** | Bajo |
| 2 | **`ProfileCompletionBar` en el dashboard**, no escondida, con CTA al campo faltante | Alto | Muy bajo |
| 3 | **Filtros en drawer inferior** en móvil con contador de filtros activos; 4 principales visibles, el resto plegado | Alto | Bajo |
| 4 | **Confirmación de contratación con más peso**: diálogo con resumen de lo que va a ocurrir, no una franja inline | Medio | Bajo |
| 5 | **Focus trap** en el modal de perfil del postulante + retorno del foco | Medio | Muy bajo |
| 6 | **Unificar el detalle de chamba** en una ruta que adapte acciones al rol | Medio | Medio |
| 7 | **Estados vacíos accionables por filtro**: sugerir cuál relajar cuando no hay resultados | Medio | Bajo |
| 8 | **Skeletons en las 16 rutas que faltan** | Bajo | Bajo |
| 9 | **Prueba con lector de pantalla** de los 3 recorridos críticos | Medio | Bajo |

---

# 11. Performance

| Apartado | Nota | Evaluación |
|---|---|---|
| **Bundle** | **7/10** | First Load JS compartido: **87,2 kB**. Rutas más pesadas: `/messages/[conversationId]` 233 kB, `/register` 213 kB, `/login` 203 kB. Las páginas de contratación quedan en 152-154 kB. Cifras razonables, pero 200+ kB para pantallas de login es alto |
| **Lazy loading** | **3/10** | **Cero `dynamic()`, cero `React.lazy`, cero `Suspense` en todo el repositorio.** El único code splitting es el automático por ruta. `JobWizardForm` (23 kB) se carga entero aunque el usuario solo vea el paso 1; `ChatWindow` (13,5 kB) y el modal de perfil se incluyen en el bundle inicial de sus rutas |
| **Consultas** | **6/10** | **Bien:** paginación por cursor en mensajes y notificaciones; `Promise.all` sistemático; `count: "exact", head: true` para conteos sin traer filas; joins con hint de FK explícito. **Mal:** ver el N+1 abajo |
| **SSR** | **8/10** | Todas las rutas dinámicas bajo demanda, correcto por depender de sesión. `cache()` de React deduplica el perfil entre layout y página. Sin ISR en las rutas públicas indexables |
| **Hidratación** | **9/10** | Cero errores de hidratación verificados en 36 combinaciones. Solo el 44 % de componentes son cliente, y `"use client"` está en las hojas — el árbol de hidratación es pequeño |
| **Realtime** | **9/10** | Presupuesto de 2 canales por usuario, debounce de tipeo, pausa por Page Visibility API. Bien diseñado y acotado |
| **Storage** | **7/10** | URLs firmadas de descarga con TTL de 1 año para adjuntos de chat — evita regenerarlas en cada carga. Los buckets tienen límite de tamaño. Sin CDN propio ni transformación de imágenes |
| **Caching** | **4/10** | `revalidatePath` de grano grueso en todas partes, sin `revalidateTag`. Sin ISR. El `sitemap.ts` consulta hasta 500 chambas **en cada petición** sin caché. `getUnreadCount()` se ejecuta en cada render del Navbar |
| **Imágenes** | **5/10** | Solo 2 archivos usan `next/image`; **7 usan `<img>` directo**. Está documentado el porqué (los avatares de Google vienen de `lh3.googleusercontent.com`, fuera de `remotePatterns`), pero la consecuencia es real: sin optimización, sin `srcset`, sin lazy loading nativo, sin dimensiones reservadas — lo que produce CLS. Afecta a la galería de chambas, la del modal de perfil y todos los avatares |
| **Tiempo de carga** | **7/10** | Con `loading.tsx` y skeletons la percepción es buena. El TTFB real depende de la latencia a Supabase (probablemente `us-east-1`) desde Perú: ~120-180 ms por consulta, que se acumulan en páginas con muchas consultas dependientes |

## El peor problema de rendimiento

```ts
// src/lib/actions/notifications.ts:166
for (const conv of convIds) {
  const { count } = await query;   // una consulta por conversación
  total += count ?? 0;
}
```

`getMessagesUnreadCount()` ejecuta **N+1 consultas secuenciales** y se invoca desde `BottomNav`, es decir **en cada render de página de cada usuario**. Con 20 conversaciones son 22 viajes de ida y vuelta antes de pintar. Es resoluble con una sola consulta agregada o una función Postgres.

## Optimizaciones priorizadas

| # | Optimización | Impacto | Esfuerzo |
|---|---|---|---|
| 1 | Colapsar el N+1 de `getMessagesUnreadCount` en una consulta | **Alto** | Bajo |
| 2 | Migrar `<img>` → `next/image` + `remotePatterns` de Google | **Alto** | Bajo |
| 3 | `dynamic()` en `JobWizardForm`, `ChatWindow` y `WorkerProfileModal` | Alto | Bajo |
| 4 | Índice `(status, created_at desc)` en `jobs` | Medio | Muy bajo |
| 5 | ISR de 60 s en `/jobs` y `/jobs/[id]` | Medio | Bajo |
| 6 | `pg_trgm` para la búsqueda por texto | Medio | Bajo |
| 7 | `LazyMotion` + `m.` de Framer Motion (~20 kB) | Medio | Medio |
| 8 | Caché del sitemap | Bajo | Muy bajo |

---

# 12. Roadmap: original vs. estado actual

## Roadmap declarado en `README.md` §8

| Fase | Descripción | Estado declarado | **Estado real** |
|---|---|---|---|
| 1 | Flujo de contratación completo | ✅ v0.4.0 | ✅ **Completado y superado** — añadidas preselección y multi-vacante |
| 2 | Chat en tiempo real | ✅ v0.5.0 | ✅ **Completado** |
| 3 | Centro de notificaciones (push, email, in-app) | 🔜 Próximo | 🟡 **En progreso 55 %** — solo in-app |
| 4 | Perfil público del trabajador | Planificado | 🟡 **En progreso 60 %** — perfil profesional sí, URL pública no |
| 5 | Búsqueda avanzada y geolocalización | Planificado | 🟡 **En progreso 80 %** — 8 filtros y compatibilidad; sin geo |
| 6 | Verificación de identidad | Planificado | 🟡 **En progreso 40 %** — subida sí, aprobación no |
| 7 | Pagos y escrow | Planificado | ⬜ **Pendiente 0 %** |
| 8 | App móvil (PWA mejorada) | Planificado | 🟡 **En progreso 70 %** — PWA instalable con offline |

## Entregado fuera del roadmap

El roadmap **no contemplaba** cinco módulos que sí se construyeron: infraestructura de Beta Privada, sistema multi-rol, wizard de publicación con imágenes, guardado de chambas y el sistema completo de asignaciones. El proyecto avanzó más de lo que su propio roadmap dice, y en direcciones distintas.

## Resumen por estado

**✅ Completado (6):** contratación · chat · design system y marca · panel admin · infraestructura beta · SEO/PWA.

**🟡 En progreso (5):** notificaciones 55 % · verificación 40 % · perfil público 60 % · búsqueda avanzada 80 % · PWA 70 %.

**⬜ Pendiente (4):** pagos y escrow · geolocalización · app nativa · centro de ayuda.

**❌ Descartado (2):** `push_subscriptions` y `notification_dispatches` — especificadas en `docs/NOTIFICACIONES-DISENO.md`, nunca implementadas y nunca marcadas como descartadas. Documentación que describe algo que no existe.

## El problema de proceso

`CLAUDE.md` establece: *"una rama por PR, un objetivo claro por PR, `main` siempre estable/desplegable"*. La realidad de `git log origin/main..HEAD`:

```
d064a4a  docs: informe ejecutivo del estado del proyecto
ac390e4  feat: preselección, contratación multi-vacante y trabajo en curso
8a1aa44  feat: Buscar Chambas + Postular
8f8521c  feat: Publicar una Chamba
fa5b0c9  feat: sistema multi-rol
0b2192b  feat: Perfil Profesional Verificado
```

**Cinco módulos independientes acumulados en una sola rama**, sin PR abierto, sin revisar, sin desplegar. Esa rama toca 5 migraciones y añade ~8.000 líneas. Es exactamente lo que la propia guía del repositorio prohíbe. Los PRs #1 a #14 se hicieron con disciplina ejemplar; el proceso se abandonó justo después.

El riesgo es acumulativo: cuanto más crece la rama, menos revisable es y más caro sale integrarla.

---

# 13. Matriz de riesgos

## 🔴 CRÍTICOS

| # | Riesgo | Impacto | Probabilidad | Mitigación |
|---|---|---|---|---|
| **R1** | Escalada a administrador vía RLS (V1) | **Total** — borrado de datos, cambio de roles, acceso a todo | **Alta** — trivial de descubrir | `WITH CHECK` por columna o trigger `BEFORE UPDATE` que rechace cambios de `role`/`is_active` para no-admin. **2 días** |
| **R2** | Verificación de identidad inoperante en producto de trabajo presencial | **Muy alto** — exposición legal y reputacional si ocurre un incidente físico | **Alta** — es el estado actual, no un escenario | Back-office de aprobación **o** retirar todas las insignias de "Verificado" de la interfaz. **4 días** |
| **R3** | Auto-contratación (V2) | **Alto** — corrompe el flujo central del negocio | **Media-alta** | Verificar propiedad en la acción + acotar la política del trabajador a `pendiente → retirado`. **1 día** |
| **R4** | Forja de reputación (V3) | **Muy alto** — destruye el activo central del marketplace | **Media** | Validar `rated_id` contra participantes + exigir `completado`. **1 día** |
| **R5** | Cero pruebas sobre la lógica de contratación | **Alto** — una regresión silenciosa contrata mal o rechaza postulantes válidos | **Alta** — es cuestión de tiempo | Suite de integración sobre los triggers + CI. **2 semanas** |
| **R6** | Deriva de esquema entre entornos | **Alto** — un despliegue que asume una migración no aplicada falla en runtime sin aviso previo | **Alta** | Supabase CLI + entorno de staging + registro de versiones. **3 días** |

## 🟠 ALTOS

| # | Riesgo | Impacto | Probabilidad | Mitigación |
|---|---|---|---|---|
| **R7** | Exposición de teléfonos sin autenticación (V4) | Alto — brecha Ley 29733 + scraping | Alta | Vista pública con columnas seguras. **1 día** |
| **R8** | Moderación de chat inoperante (V8) | Alto — acoso sin contención en producto que conecta desconocidos | Media | Implementar el bloqueo de verdad. **1 día** |
| **R9** | Notificaciones solo in-app | Alto — pérdida directa de conversión en contrataciones | **Muy alta** — ocurre hoy | WhatsApp Business API + email. **7 días** |
| **R10** | Textos legales `[PROVISIONAL]` | Alto — sin defensa contractual ante disputas | Media | Abogado peruano. **Externo** |
| **R11** | Sin monitoreo de errores | Medio-alto — los fallos de producción son invisibles | **Muy alta** | Sentry + logging estructurado. **1 día** |
| **R12** | Rama de 5 módulos sin mergear | Medio-alto — conflictos crecientes, revisión impracticable | Alta | Trocear en PRs revisables. **2 días** |
| **R13** | Sin backups verificados ni plan de recuperación | Muy alto si se materializa | Baja | Verificar PITR de Supabase y documentar el procedimiento. **1 día** |
| **R14** | Sin rate limiting fuera del chat (V9) | Medio-alto — cuentas y chambas masivas | Media | Middleware de limitación por IP/usuario. **2 días** |
| **R15** | Conversaciones no solicitadas (V7) | Medio-alto — spam y acoso directo | Media | Exigir vínculo de contratación en la política. **0,5 días** |

## 🟡 MEDIOS

| # | Riesgo | Impacto | Probabilidad | Mitigación |
|---|---|---|---|---|
| **R16** | N+1 en `getMessagesUnreadCount` | Medio — degrada todas las páginas al crecer | Alta | Consulta agregada única. **0,5 días** |
| **R17** | `is_active` como señal de "verificado" | Medio — engaña al empleador al decidir | **Segura** — ocurre hoy | Corregir tras implementar la verificación real. **0,5 días** |
| **R18** | Ausencia de CSP (V11) | Medio | Baja | Cabecera en `next.config.js`. **0,5 días** |
| **R19** | Bucket `job-images` permisivo (V12) | Medio — escritura/borrado en carpetas ajenas | Media | Política con verificación de carpeta. **0,5 días** |
| **R20** | Chat multi-vacante roto | Medio — módulo recién construido funcionalmente incompleto | Alta si hay multi-vacante | `UNIQUE (job_id, worker_id)`. **1 día** |
| **R21** | Dependencia total de Supabase | Medio — un cambio de precios o política obliga a reescribir | Baja | Aceptar conscientemente; documentar el coste de salida |
| **R22** | Sin modelo de ingresos | Medio — no hay validación de que el negocio funcione | **Segura** | Fase v1.0 |
| **R23** | Bus factor de 1 | Medio-alto — todo el contexto en una persona + `CLAUDE.md` | Media | Documentar decisiones; incorporar un segundo desarrollador |
| **R24** | Deuda de actualización Next 15 / React 19 | Bajo-medio, creciente | Alta | Planificar la migración en v0.9 |

## 🟢 BAJOS

| # | Riesgo | Mitigación |
|---|---|---|
| **R25** | Cinco versiones contradictorias | Fuente única en `package.json`. **1 hora** |
| **R26** | `<img>` sin optimizar afecta Core Web Vitals | `next/image` + `remotePatterns`. **0,5 días** |
| **R27** | 13 ramas locales sin limpiar | `git branch -d`. **10 min** |
| **R28** | Documentación desactualizada | Actualizar README y roadmap. **3 horas** |
| **R29** | Sin `.env.example`; `NEXT_PUBLIC_SITE_URL` indocumentada | Crear el archivo. **15 min** |
| **R30** | Cobertura de skeletons al 41 % | Añadir los 16 faltantes. **1 día** |

---

# 14. Mejoras

## ¿Qué cambiaría?

1. **El criterio con el que se escriben las políticas RLS.** Hoy se escriben pensando en *quién* toca la fila. Deben escribirse pensando en *qué puede cambiar de ella*. Toda política de UPDATE necesita `WITH CHECK` explícito, y las columnas que otorgan privilegios (`role`, `is_active`, `status`) deben quedar fuera del alcance del propietario de la fila.

2. **La definición de "hecho".** Hoy "hecho" significa "compila y se ve bien". Debe significar "compila, tiene prueba, la prueba está en CI y CI está en verde". Sin ese cambio, los otros 19 puntos de esta lista se van a repetir.

3. **El proceso de migraciones.** Del SQL Editor a la CLI de Supabase, con staging propio. Es el cambio operativo de mayor retorno de todos.

## ¿Qué eliminaría?

1. **`updateApplicationStatus` y `ApplicantRow`.** No es solo duplicación: es la ruta insegura de V2 conviviendo con la segura. Mientras existan ambas, alguien mantendrá la equivocada. `applications.ts` ya cubre todos los casos con verificación de propiedad. *Eliminar la ruta insegura es más fiable que recordar no usarla.*

2. **Una de las dos rutas de detalle de chamba.** `/jobs/[id]` es la pública e indexable; `/dashboard/worker/jobs/[id]` debería redirigir a ella. *Dos vistas de la misma entidad divergen con el tiempo y duplican cada corrección.*

3. **`jobs.assigned_worker_id`.** `job_assignments` es la fuente completa desde `0011`. Deprecar por fases: dejar de leerla, luego dejar de escribirla, luego borrarla —tras migrar las políticas RLS que dependen de ella. *Dos fuentes de verdad para el mismo hecho siempre terminan en contradicción.*

4. **El tipo `Database` escrito a mano.** 180 líneas y 40 casts que se desincronizan en silencio. `supabase gen types typescript` lo genera correcto. *El compilador solo protege si el tipo es cierto; hoy no hay garantía de que lo sea.*

5. **Las 13 ramas muertas** y el segundo proyecto de Netlify.

6. **Las insignias de "Verificado" de la interfaz** — hasta que la verificación exista. *O se verifica o no se afirma; la opción intermedia es publicidad engañosa.*

## ¿Qué simplificaría?

1. **Los 8 filtros de búsqueda → 4 visibles.** Palabra clave, ciudad, categoría, urgencia; el resto tras "más filtros". *En móvil, 8 filtros no producen mejores búsquedas: producen abandono.*

2. **Un solo número de versión.** `package.json` como fuente única; `beta-config.ts` lo lee. *Cinco versiones hacen imposible saber qué se estaba ejecutando cuando llega un reporte de error.*

3. **Los 5 documentos de diseño en 2.** `FLUJO-CONTRATACION.md`, `NOTIFICACIONES-DISENO.md` y `PRESELECCION-Y-ASIGNACIONES.md` describen partes del mismo flujo y ya se contradicen entre sí.

4. **El preámbulo de las Server Actions** con un helper `withAuth()`. *Además de reducir ruido, un punto único de entrada es el lugar natural donde añadir después rate limiting y logging.*

## ¿Qué automatizaría?

| # | Automatización | Justificación |
|---|---|---|
| 1 | **CI: lint + tsc + build + tests en cada PR**, con protección de rama | Hoy la verificación depende de que alguien recuerde ejecutarla |
| 2 | **Migraciones vía Supabase CLI** en el pipeline de despliegue | Aplicarlas a mano es la mayor fuente de deriva entre entornos |
| 3 | **Generación de tipos desde el esquema** en pre-commit | Elimina de raíz los 40 casts inseguros |
| 4 | **Pruebas de RLS**: por cada tabla, intentar el acceso indebido y fallar si tiene éxito | Los tres críticos existen porque nadie escribió esa prueba |
| 5 | **Limpieza de notificaciones >90 días** con `pg_cron` | Ya está especificado como comentario en `0004`; falta ejecutarlo |
| 6 | **Cálculo de `profile_stats` por trigger** | Hoy depende de que el cliente llame a la acción; si no la llama, el score queda obsoleto |
| 7 | **Dependabot** | 12 dependencias de producción sin vigilancia de CVEs |
| 8 | **Presupuesto de Lighthouse en CI** | Evita que el bundle crezca sin que nadie lo note |

## ¿Qué reescribiría?

1. **`getMessagesUnreadCount()`** — de N+1 secuencial a una función Postgres.
2. **Las 3 políticas RLS críticas** — con `WITH CHECK` explícito por columna.
3. **`submitRating()`** — validando `rated_id` contra participantes y exigiendo `status = 'completado'`.
4. **`blockConversation()`** — escribiendo en las filas de ambos participantes y leyendo `is_blocked` en `sendMessage`.
5. **`computeCompatibility()`** — como función SQL `immutable` para ordenar en la base, y leyendo una señal de verificación real.

## ¿Qué modularizaría?

1. **`ChatWindow`** — separar la lógica de scroll, la de mensajes optimistas y la de reconexión en hooks propios.
2. **`JobWizardForm`** — un componente por paso, con `dynamic()` para los pasos 2-4.
3. **La capa de acceso a datos** — un módulo `lib/repositories/` que envuelva `supabase-js` y devuelva tipos correctos, eliminando los 40 casts y desacoplando parcialmente del proveedor.
4. **Las verificaciones de autorización** — un `lib/auth/guards.ts` con `assertOwnsJob`, `assertParticipant`, `assertAdmin` reutilizables. *Hoy `assertAdmin` vive en `admin.ts` y `assertParticipant` en `chat.ts`; centralizarlas evita que la próxima acción olvide llamarlas.*

## ¿Qué optimizaría?

Ver §11. Por orden de retorno: el N+1 de mensajes · `next/image` · `dynamic()` en los 3 componentes pesados · índice `(status, created_at desc)` · ISR en rutas públicas · `pg_trgm`.

---

# 15. Roadmap hacia MVP v1.0

## v0.7.0 — "Blindaje"

**Objetivo:** que el producto no pueda ser destruido por un usuario con la consola del navegador abierta, y que las correcciones no puedan reintroducirse.

| Tarea | Días |
|---|---|
| Corregir `profiles_update_own` (bloquear `role` e `is_active`) | 2 |
| Verificación de propiedad en `updateApplicationStatus`; eliminar `ApplicantRow` | 1 |
| Validar `rated_id` y exigir `completado` en calificaciones | 1 |
| Vista pública de `profiles` sin `phone` | 1 |
| Endurecer `job_state_history`, `conversations` y bucket `job-images` | 1,5 |
| Escapar `q` en los filtros PostgREST | 0,5 |
| Cabecera CSP | 0,5 |
| Vitest + **una prueba de RLS por vulnerabilidad corregida** | 3 |
| GitHub Actions: lint + tsc + build + tests como gate de merge + protección de rama | 1 |
| Sentry + logging estructurado | 1 |
| Verificar y documentar backups (PITR) | 0,5 |

- **Duración:** 2 semanas
- **Complejidad:** media
- **Beneficio:** elimina el riesgo de pérdida total del producto
- **Prioridad: 1 — nada más se construye hasta cerrar esto**

---

## v0.8.0 — "Confianza"

**Objetivo:** que "trabajador verificado" signifique algo, y que el trabajador se entere de que lo contrataron.

| Tarea | Días |
|---|---|
| Back-office de verificación en `/admin` (lista, visor, aprobar/rechazar con motivo) | 4 |
| Trigger que recalcula `profile_stats` al verificarse un documento | 1 |
| Corregir la semántica de "verificado" en `compatibility.ts` y `ApplicantCard` | 1 |
| Edge Function `dispatch-notification` + Resend (email) | 3 |
| Integración WhatsApp Business API para los 4 eventos críticos | 4 |
| Interfaz de preferencias de canal (sobre la tabla existente) | 2 |
| Arreglar el bloqueo de conversaciones | 1 |
| Rate limiting global sobre Server Actions | 2 |
| Mergear los 5 módulos de la rama en PRs revisables | 2 |
| Textos legales definitivos (externo, en paralelo) | — |

- **Duración:** 3 semanas
- **Complejidad:** media-alta (la integración de WhatsApp tiene dependencias externas)
- **Beneficio:** desbloquea la propuesta de valor diferencial y la conversión de contrataciones
- **Prioridad: 2**

---

## v0.9.0 — "Escala"

**Objetivo:** aguantar tráfico real y cerrar la deuda técnica antes de que se vuelva cara.

| Tarea | Días |
|---|---|
| Resolver el N+1 de `getMessagesUnreadCount` | 1 |
| Migrar `<img>` → `next/image` + `remotePatterns` de Google | 1 |
| `dynamic()` en `JobWizardForm`, `ChatWindow`, `WorkerProfileModal` | 1 |
| Índices `(status, created_at desc)` + `pg_trgm` + `ratings(job_id)` | 1 |
| Compatibilidad como función SQL con orden en base | 2 |
| ISR en `/jobs` y `/jobs/[id]` | 1 |
| Regenerar tipos con `supabase gen types`; eliminar los 40 casts | 2 |
| Migraciones vía Supabase CLI + entorno de staging con base propia | 3 |
| Unificar el detalle de chamba en una ruta | 2 |
| `UNIQUE (job_id, worker_id)` en conversaciones | 1 |
| Onboarding progresivo tras el registro | 3 |
| Recuperación de contraseña | 1 |
| Playwright sobre los 3 recorridos críticos | 3 |
| Retención automática de notificaciones (`pg_cron`) | 0,5 |

- **Duración:** 3 semanas
- **Complejidad:** media
- **Beneficio:** rendimiento estable con miles de usuarios y despliegues reproducibles
- **Prioridad: 3**

---

## v1.0.0 — "Lanzamiento"

**Objetivo:** producto público, monetizable y defendible.

| Tarea | Días |
|---|---|
| Pagos con proveedor local (Culqi / Niubiz / Mercado Pago) | 8 |
| Escrow: retención hasta confirmación de completado | 5 |
| Flujo de disputa e incidente (cancelar chamba en progreso) | 4 |
| Geolocalización con PostGIS y búsqueda por radio | 4 |
| Perfil público del trabajador (URL compartible, SEO) | 3 |
| Centro de ayuda / FAQ | 2 |
| Panel de moderación de reportes entre usuarios | 3 |
| Auditoría de seguridad externa | — |
| Plan documentado de respuesta a incidentes | 1 |

- **Duración:** 4 semanas
- **Complejidad:** alta (pagos y escrow tienen requisitos regulatorios)
- **Beneficio:** modelo de ingresos y producto defendible
- **Prioridad: 4**

## Resumen

| Versión | Objetivo | Duración | Complejidad | Beneficio | Prioridad |
|---|---|---|---|---|---|
| **v0.7.0** | Blindaje de seguridad + CI | 2 sem | Media | **Crítico** | **1** |
| **v0.8.0** | Confianza y notificaciones | 3 sem | Media-alta | Alto | 2 |
| **v0.9.0** | Rendimiento y deuda técnica | 3 sem | Media | Medio-alto | 3 |
| **v1.0.0** | Pagos y lanzamiento | 4 sem | Alta | Alto | 4 |

**Total: 12 semanas (~3 meses)** a dedicación completa, más los tiempos externos de abogado, proveedor de pagos y auditoría.

---

# 16. Beta Privada

## ¿Puede Chamby iniciar Beta Privada?

**Sí, con condiciones explícitas.** Calificación de preparación: **7/10**.

Con un grupo cerrado de 10-30 personas conocidas y bajo acuerdo de que están probando software incompleto, la beta aporta más de lo que arriesga. **No** con desconocidos, **no** con transacciones económicas reales, y **no** sin cerrar antes los dos puntos que se indican abajo.

## Qué funciona

- El recorrido completo del producto es recorrible de punta a punta sin bloqueos.
- La infraestructura de beta es de las mejores piezas del proyecto: badge de versión visible, botón flotante de reporte de errores con captura automática de ruta/navegador/OS/resolución/versión, panel `/admin/beta` con 10 métricas y guía de 10 escenarios en `/beta`.
- Chat en tiempo real estable.
- Responsive verificado en 6 viewports.
- Autenticación con email y con Google.

## Qué no funciona

| Problema | Gravedad para la beta |
|---|---|
| Cualquier tester puede hacerse administrador desde la consola (V1) | **Bloqueante blando** — en grupo cerrado y conocido es tolerable, pero hay que decírselo explícitamente al grupo, o corregirlo antes |
| Ninguna insignia de "Verificado" aparecerá jamás | **Bloqueante blando** — los testers reportarán que "la verificación no funciona" y tendrán razón; hay que anticiparlo o retirar la insignia |
| No hay notificaciones fuera de la app | Alto — los testers no volverán solos; habrá que avisarles por WhatsApp manualmente |
| Bloquear conversaciones no hace nada | Medio — si alguien lo prueba, reportará un fallo real |
| Chat multi-vacante incompleto | Medio — evitar chambas con más de 1 vacante en la beta |
| Sin recuperación de contraseña | Medio — un tester que olvide su clave queda fuera |
| Textos legales `[PROVISIONAL]` | Bajo en grupo cerrado |

## Recomendación de dos correcciones previas (3 días)

1. **Cerrar V1** (escalada a admin) — 2 días. Es la única que puede terminar la beta de golpe.
2. **Retirar las insignias de "Verificado"** de la interfaz hasta que la verificación exista — 0,5 días. Evita recoger *feedback* contaminado sobre una funcionalidad que no existe.

## Qué probaría con usuarios

**Recorridos críticos:**
1. Registro → completar perfil → buscar chamba → postular. *Hipótesis: sin onboarding, el perfil queda vacío.*
2. Publicar chamba (wizard 4 pasos) → recibir postulantes → preseleccionar → contratar. *Hipótesis: el wizard funciona bien; la decisión de contratar carece de información suficiente.*
3. Contratación → chat → completar → calificar mutuamente.
4. Cambio de rol trabajador↔empleador en la misma cuenta.
5. Uso exclusivo desde móvil con datos móviles, no WiFi.

**Preguntas a responder:**
- ¿Cuánto tarda un empleador en publicar su primera chamba desde que se registra?
- ¿Qué porcentaje de trabajadores completa el perfil sin que nadie se lo pida?
- ¿Entienden qué significa el porcentaje de compatibilidad?
- ¿Vuelven a la app sin notificación externa?
- ¿Prefieren el chat de Chamby o se pasan a WhatsApp? *(Esta es la pregunta más importante de toda la beta.)*

## Métricas a recoger

| Categoría | Métrica |
|---|---|
| **Activación** | % que completa el perfil · tiempo hasta la primera chamba publicada · tiempo hasta la primera postulación |
| **Conversión** | Postulaciones por chamba · % de chambas que llegan a contratación · **tiempo entre publicar y contratar** (métrica estrella) |
| **Retención** | % que vuelve al día 1, 7 y 30 · sesiones por usuario y semana |
| **Compromiso** | Mensajes por conversación · % de contrataciones con chat activo · **% que migra a WhatsApp** |
| **Calidad** | Errores reportados por usuario · rutas con más reportes · % de trabajos completados vs. cancelados · % que califica |
| **Técnicas** | Tiempo de carga por ruta · errores de JavaScript · fallos de Realtime |

`getBetaStats()` ya cubre 10 de estas. Faltan las de activación y retención, que exigirían analítica de producto.

## Errores que esperaría encontrar

**Muy probables:**
1. Perfiles vacíos por falta de onboarding → compatibilidades bajas y desconcierto.
2. "No me llegó nada" — sin notificaciones externas, los usuarios no vuelven.
3. Confusión entre los dos detalles de chamba (`/jobs/[id]` vs. el del dashboard).
4. Los 8 filtros abrumando en móvil.
5. Fricción al cambiar de rol: el usuario no entiende que `profiles.role` es un "modo".
6. Reportes de que la verificación "no hace nada".

**Probables:**
7. Fallos de Realtime en redes móviles inestables (sin backoff exponencial).
8. Imágenes lentas o con saltos de layout (sin `next/image`).
9. Un tester curioso descubriendo V1.
10. Timeout o error en el trigger de contratación bajo concurrencia.

**Posibles:**
11. Corrupción de datos por una migración no aplicada en el entorno correcto.
12. Agotamiento de conexiones de Supabase si la beta es grande.

---

# 17. Producción

## Imprescindible

| # | Requisito | Justificación |
|---|---|---|
| 1 | Las 3 vulnerabilidades críticas cerradas **con prueba** | Sin la prueba, la corrección es temporal |
| 2 | Back-office de verificación **o** retirar las insignias | Afirmar lo que no se cumple es indefendible ante un incidente |
| 3 | Teléfonos fuera del alcance anónimo | Obligación bajo Ley N.º 29733 |
| 4 | Textos legales reales | Sin términos válidos no hay defensa contractual |
| 5 | CI con tests como gate de merge | Única forma de que las correcciones no se reviertan solas |
| 6 | Monitoreo de errores en producción | Sin él, el primer fallo grave se conoce por redes sociales |
| 7 | Backups verificados + plan de recuperación documentado | No basta con que Supabase los tenga: hay que haber probado restaurar |
| 8 | Entorno de staging con base propia | Probar migraciones contra producción es inaceptable |
| 9 | Rate limiting global | Sin él, el registro y la publicación son scriptables |
| 10 | Bloqueo de conversaciones funcional | Única herramienta anti-acoso |
| 11 | Recuperación de contraseña | Requisito básico de un producto con cuentas |
| 12 | Migraciones versionadas vía CLI | Nadie puede desplegar con confianza sin esto |

## Recomendable

| # | Requisito | Justificación |
|---|---|---|
| 13 | Notificaciones por WhatsApp/email | Mayor retorno sobre conversión de todo el backlog |
| 14 | Onboarding progresivo | Ataca la causa raíz de los perfiles vacíos |
| 15 | Auditoría de seguridad externa | Segundo par de ojos sobre RLS; esta auditoría encontró lo que la anterior no vio |
| 16 | Optimizaciones de rendimiento (N+1, imágenes, índices) | Previene la degradación al crecer |
| 17 | Analítica de producto | Sin datos no se puede iterar |
| 18 | Centro de ayuda / FAQ | Reduce carga de soporte |
| 19 | CSP | Defensa en profundidad contra XSS |
| 20 | Panel de moderación de reportes | Necesario en cuanto haya volumen |

## Opcional

| # | Requisito |
|---|---|
| 21 | Pagos y escrow (opcional para *lanzar*, imprescindible para *monetizar*) |
| 22 | Geolocalización con PostGIS |
| 23 | Perfil público del trabajador |
| 24 | App móvil nativa |
| 25 | Migración a Next 15 / React 19 |
| 26 | Modo oscuro, internacionalización, 2FA |

---

# 18. Inversión

*Respondo como CTO evaluando una inversión técnica. **Advertencia importante:** puedo auditar el código con rigor, pero no puedo validar mercado, tracción, unit economics ni equipo desde un repositorio. Todo lo que sigue es una evaluación de la calidad y viabilidad **técnica** del activo, más juicio de producto. Cualquier decisión real de inversión necesita la diligencia comercial que no tengo forma de hacer aquí.*

## ¿Invertiría en Chamby?

**Sí, condicionalmente — con el desembolso ligado a hitos técnicos verificables.**

No entregaría el capital completo hoy. Estructuraría un primer tramo pequeño atado a la entrega de v0.7 (blindaje + CI) y v0.8 (verificación operativa), con auditoría de seguridad externa como condición de desbloqueo del segundo tramo.

## ¿Por qué?

**A favor:**

1. **El producto existe y funciona.** No es una maqueta ni un *pitch deck*: es un marketplace completo con 15.941 líneas donde el recorrido crítico se puede recorrer hoy. La mayoría de proyectos en esta etapa no tienen ni la mitad.
2. **La marca es un activo real y difícil de copiar.** La hormiguita, el tono, el lenguaje visual — eso es trabajo de producto que no se compra rápido y que en un mercado de trabajo informal genera cercanía.
3. **Las decisiones de arquitectura son acertadas para la etapa.** Supabase elimina la necesidad de un equipo de infraestructura. El presupuesto explícito de 2 canales Realtime por usuario indica que quien lo construyó ya vio un sistema morir por *fan-out* de suscripciones.
4. **Los problemas encontrados son caros de ignorar pero baratos de arreglar.** Las tres vulnerabilidades críticas se cierran en menos de una semana. Eso es muy distinto de un problema arquitectónico de fondo, que costaría meses.
5. **Hay cultura de documentación honesta.** El hallazgo P3 de la auditoría previa era falso, se detectó, y en lugar de borrarlo se documentó el error con su causa raíz y se convirtió en una regla en `CLAUDE.md`. Eso es un indicador de equipo mejor que cualquier métrica de código.

**En contra:**

1. **Cero ingresos y cero infraestructura de ingresos.** El modelo de negocio no está construido ni validado.
2. **Cero pruebas.** El activo es más frágil de lo que aparenta.
3. **Bus factor de 1.** Todo el contexto está en una persona y en un archivo Markdown.
4. **No hay evidencia de tracción en el repositorio.** No puedo saber si alguien usa esto.

## Potencial en Perú

**Alto en el planteamiento, no verificable desde aquí.**

La tesis es sólida: el trabajo temporal e informal en Perú se coordina hoy por WhatsApp, Facebook Marketplace y el boca a boca, sin reputación portable, sin verificación y sin trazabilidad. Un marketplace que aporte reputación acumulada y verificación resuelve un problema real.

**Pero la tesis tiene un supuesto crítico que el código todavía no sostiene:** que la gente confiará en la plataforma más que en la recomendación de un conocido. Esa confianza se compra con verificación real, no con una insignia. Hoy Chamby tiene la insignia sin la verificación — es decir, tiene exactamente lo que no diferencia.

**El riesgo competitivo más serio no es otro marketplace: es WhatsApp.** Es gratis, ya está instalado, y todo el mundo sabe usarlo. Chamby tiene su propio chat, lo cual es correcto para retener la transacción dentro de la plataforma, pero **la primera métrica que miraría en la beta es qué porcentaje de usuarios se pasa a WhatsApp en cuanto se contratan.** Si es alto, el producto pierde el control de la relación y con él la capacidad de monetizar.

## Posibilidades de escalar

**Técnicamente: buenas, con techos conocidos y localizados.** No hay ningún problema arquitectónico que impida escalar; hay optimizaciones pendientes, todas identificadas en §11 y §8, y todas de esfuerzo bajo o medio.

**Comercialmente: no evaluable desde el código.**

## Qué haría falta por cada tramo de usuarios

### 1.000 usuarios

**Técnico:** prácticamente nada más de lo que hay. Las 3 vulnerabilidades críticas cerradas, monitoreo, backups verificados y notificaciones por WhatsApp. La arquitectura actual lo aguanta sin cambios.
**Producto:** onboarding y verificación operativa.
**Equipo:** 1 desarrollador.
**Infraestructura:** plan Pro de Supabase (~25 USD/mes) + Netlify.

### 10.000 usuarios

**Técnico:** todo lo de v0.9 — N+1 resuelto, índices de búsqueda con `pg_trgm`, `next/image`, ISR, pooler de conexiones configurado, retención de notificaciones.
**Producto:** pagos, disputas, centro de ayuda.
**Equipo:** 2-3 desarrolladores + 1 de soporte/moderación.
**Infraestructura:** Supabase Pro con cómputo aumentado, CDN de imágenes.
**Nuevo riesgo:** la moderación deja de ser opcional. Con 10.000 usuarios habrá fraude, acoso y perfiles falsos.

### 100.000 usuarios

**Técnico:** particionado de `messages` y `notifications`, réplicas de lectura, caché distribuida (Redis) para conteos y sesiones, búsqueda dedicada (Elasticsearch o Typesense), colas para el despacho de notificaciones, observabilidad completa con trazas.
**Producto:** verificación automatizada con proveedor de identidad (RENIEC vía intermediario), sistema antifraude, matching por geolocalización.
**Equipo:** 6-10 personas incluyendo un SRE y un equipo de confianza y seguridad.
**Infraestructura:** probablemente ya fuera de Supabase gestionado, o en su plan Enterprise.
**Aquí se paga el precio del acoplamiento total al proveedor** identificado en §6.

### 1.000.000 usuarios

**Técnico:** reescritura parcial. Separación de servicios (mensajería, notificaciones, búsqueda y pagos como servicios propios), base multirregión, CQRS para las lecturas de alto volumen.
**Producto:** operación en varios países, cumplimiento regulatorio por jurisdicción.
**Equipo:** 30+ personas.
**Realidad:** a esta escala el código actual es el prototipo del que se aprendió, no la base sobre la que se opera. Y eso está bien: ningún MVP debe construirse para un millón de usuarios.

## Riesgos comerciales

| # | Riesgo | Gravedad |
|---|---|---|
| 1 | **Desintermediación hacia WhatsApp** tras el primer contacto | **Crítico** — destruye la capacidad de monetizar |
| 2 | **Problema del huevo y la gallina**: sin trabajadores no hay empleadores y viceversa | **Crítico** — clásico de todo marketplace; exige subsidiar un lado |
| 3 | **Incidente de seguridad física** entre usuarios con la verificación falsa de por medio | **Crítico** — riesgo existencial y reputacional |
| 4 | **Sin modelo de ingresos validado** | Alto |
| 5 | Competencia de un actor establecido (Computrabajo, Bumeran, o Mercado Libre) que añada esta vertical | Alto |
| 6 | Regulación laboral: si se interpreta que Chamby es empleador y no intermediario | Alto |
| 7 | Fraude en pagos cuando existan | Medio-alto |
| 8 | Concentración geográfica: un marketplace local necesita densidad, no dispersión | Medio |

## Ventajas competitivas

| # | Ventaja | Defendibilidad |
|---|---|---|
| 1 | **Marca e identidad visual** — la hormiguita, el tono, el lenguaje propio | **Alta** — cuesta tiempo y criterio replicar |
| 2 | **Reputación acumulada bidireccional** con separación por rol | **Alta** — es el clásico efecto de red; el usuario no se lleva su historial a otra parte |
| 3 | **Sistema multi-rol** en una sola cuenta | Media — poco común y muy adecuado al mercado informal peruano, donde la misma persona contrata y trabaja |
| 4 | **Chat integrado con contexto de la chamba** | Media — evita la desintermediación *si* la experiencia supera a WhatsApp |
| 5 | **SEO con `JobPosting`** elegible para Google Jobs | Media — canal de adquisición orgánica gratuito |
| 6 | **Verificación de identidad** | **Potencialmente alta, hoy nula** — sería la ventaja más defendible de todas, y es justo la que no está construida |

**Nótese la ironía:** la ventaja competitiva de mayor potencial es la única que hoy no existe.

---

# 19. Calificación final

| Dimensión | Nota | Justificación |
|---|---|---|
| **Arquitectura** | **7,5/10** | Decisiones acertadas para el contexto y la etapa: App Router usado idiomáticamente, separación limpia de clientes Supabase, presupuesto explícito de canales Realtime, Server Components por defecto. Resta el acoplamiento total al proveedor sin capa de abstracción, la lógica de negocio repartida entre triggers y TypeScript sin criterio explícito de qué va dónde, y la ausencia de staging |
| **Código** | **7,5/10** | Organización ejemplar por dominio, `strict: true` sin `any` sueltos, comentarios que explican el porqué, nomenclatura coherente con el negocio. Penalizan los 40 casts `as unknown as` que anulan al compilador y cuatro casos de duplicación real, uno de ellos con criterios de seguridad divergentes |
| **Seguridad** | **4/10** | Los fundamentos están bien elegidos: RLS en el 100 % de tablas, `security definer` con `search_path` fijado, service role aislado, CSRF nativo, cero secretos en el repositorio, cero `dangerouslySetInnerHTML`. Pero tres políticas mal delimitadas por columna permiten hacerse administrador, auto-contratarse y forjar reputación. La nota califica el sistema resultante, no la intención |
| **UX** | **8,5/10** | Identidad de marca genuina y diferenciadora, responsive verificado en 6 viewports, contraste AA, `useReducedMotion`, estados vacíos con voz propia, wizard de publicación excelente. Restan el onboarding inexistente (4/10 aislado) y el *focus trap* faltante en el modal |
| **Performance** | **6,5/10** | Bundle razonable (87 kB compartidos), `Promise.all` consistente, paginación por cursor, tres índices parciales bien aplicados, cero errores de hidratación. Penalizan fuerte el N+1 en cada render de página, la ausencia total de `dynamic()`/`Suspense` y `<img>` sin optimizar |
| **Escalabilidad** | **6/10** | Aguanta ~10.000 usuarios sin cambios estructurales. Los techos son concretos y están localizados: N+1 en mensajes, orden por compatibilidad en memoria, sin particionado ni retención, sin pooler, sin réplicas. Ninguno es un problema arquitectónico de fondo |
| **Documentación** | **7/10** | Muy por encima de la media: CHANGELOG detallado, 5 documentos de diseño, `CLAUDE.md` que transmite el conocimiento no evidente, `DESIGN_SYSTEM.md`, PRs con descripciones ejemplares, y una corrección de auditoría documentada con honestidad. Penaliza que esté **desactualizada y en parte sea falsa**: README con 3 de 11 migraciones, roadmap que ignora 5 módulos, cinco versiones contradictorias, y un documento de diseño que especifica tablas nunca creadas |
| **Base de datos** | **7/10** | Modelo normalizado, relaciones correctas, uso hábil de índices parciales, triggers atómicos con `FOR UPDATE`, 11 migraciones sin una sola operación destructiva. Penalizan la ausencia de índices de búsqueda, la falta de retención y particionado, la segunda fuente de verdad heredada, y sobre todo el proceso manual de migraciones |
| **DevOps** | **2/10** | Solo `netlify.toml`. **Sin CI, sin tests, sin staging, sin monitoreo, sin backups documentados, sin protección de rama, sin `.env.example`, migraciones a mano.** Es la dimensión más débil del proyecto por un margen amplio, y la que causa varios de los demás problemas |
| **Calidad general** | **6,8/10** | Producto bien concebido, bien diseñado y bien organizado, con dos brechas graves —la capa de autorización y la ausencia total de verificación automatizada— que son bloqueantes pero baratas de cerrar. Con la fase v0.7 completada, este proyecto vale 8/10 |

---

# 20. Opinión como CTO

*Honesta y sin complacencia, como se pidió.*

## Lo que este proyecto hace muy bien

Empiezo por aquí porque es real y no quiero que se pierda entre las críticas.

**El criterio de producto es sólido.** Alguien pensó de verdad en el usuario peruano: la hormiguita no es decoración, es una identidad que un albañil de Villa El Salvador va a recordar; el *mobile-first* es genuino, no una adaptación; los estados vacíos hablan como habla la gente. Ese trabajo no se compra ni se improvisa.

**Hay decisiones de ingeniería de nivel alto.** El presupuesto de 2 canales Realtime por usuario es la clase de restricción que se define cuando alguien ya vio morir un sistema por *fan-out* de suscripciones. `cache()` de React para deduplicar el perfil entre layout y página. Tres índices parciales bien elegidos. Once migraciones sin una sola operación destructiva. Todas las funciones con `search_path` fijado. Nada de eso es accidental.

**La documentación está por encima de la media de la industria**, y hay un detalle que dice mucho: el hallazgo P3 de la auditoría previa era falso, se detectó, y en lugar de borrarlo se documentó el error con su causa raíz —"se revisó el TypeScript sin revisar los triggers"— y se convirtió en una regla permanente en `CLAUDE.md`. Esa honestidad es cultura de ingeniería, y vale más que muchas líneas de código.

## ¿Qué haría diferente?

**Habría escrito las pruebas de RLS el día que escribí la primera política.** Este es el error del que se derivan casi todos los demás. RLS es la única barrera de autorización del sistema — con la anon key pública, no hay nada más entre un atacante y la base de datos. Se escribieron políticas para 17 tablas y **no se escribió una sola prueba que intentara violarlas.** Por eso tres agujeros críticos llevan ahí desde `0001_init.sql` —el primer día del proyecto— y pasaron por una auditoría de calidad que los declaró inexistentes.

**No habría dejado que la auditoría se detuviera en la superficie.** `docs/AUDITORIA.md` afirma "críticos: 0" y aporta como evidencia "RLS activo en todas las tablas con políticas de ownership". Verificó que RLS estuviera **encendido**, no que estuviera **bien delimitado**. Es el mismo error del P3 en espejo: entonces se leyó TypeScript sin leer SQL; aquí se leyó SQL sin leerlo columna por columna. **Una auditoría que no intenta romper el sistema es un inventario.**

**Habría puesto CI en el commit número 3.** Cuesta una hora. Hoy, con 15.941 líneas y cinco módulos sin integrar, cada merge es un acto de fe.

**No habría acumulado cinco módulos en una rama.** El propio repositorio establece "una rama por PR" y los primeros 14 PRs lo cumplieron con disciplina ejemplar. Luego se abandonó. Esa rama toca 5 migraciones y ~8.000 líneas: nadie la va a revisar de verdad, y ya se sabe que no lo hará. El proceso no se abandona porque deje de ser útil; se abandona porque revisar es lento y construir es divertido. El precio se paga después, siempre.

## ¿Qué errores detecto?

1. **Confundir "RLS habilitado" con "autorización correcta".** El error conceptual raíz. En PostgreSQL, `UPDATE ... USING (auth.uid() = id)` sin `WITH CHECK` por columna significa "el dueño puede cambiar lo que quiera de su fila" — incluida la columna que define sus privilegios. Se escribió pensando en *quién* toca la fila, sin preguntar *qué puede cambiar de ella*.

2. **Construir la fachada de la confianza antes que su mecanismo.** Existe la insignia "Verificado", la tabla de documentos, el bucket privado, el `trust_score`, la subida de DNI y antecedentes, y toda la interfaz que consume `status === 'verified'`. No existe la pantalla que aprueba un documento. Se construyó todo el escenario menos la función que le da sentido. Y mientras tanto la interfaz le dice a los empleadores que hay trabajadores verificados que no lo están.

3. **Usar `is_active` como señal de verificación.** Vale `true` por defecto para todos: 15 de 100 puntos de compatibilidad que no discriminan nada. Aparece en `compatibility.ts` y en `ApplicantCard`. **Es código de mi propia sesión anterior y es un error mío**: tomé la columna que tenía a mano en lugar de la que significaba lo que necesitaba.

4. **Velocidad de construcción muy por encima de la velocidad de verificación.** Cinco módulos grandes en pocos días con `npm run build` como único criterio de aceptación. Un build verde solo demuestra que el código compila.

5. **Documentación que envejece sin que nadie la jubile.** El README describe 3 migraciones de 11 y un roadmap que ignora la mitad de lo construido. `NOTIFICACIONES-DISENO.md` especifica tablas que nunca se crearon. **Documentación falsa es peor que ninguna: la gente confía en ella.**

6. **Cinco versiones distintas del mismo producto.** Cuando llegue el primer reporte de error serio, nadie podrá saber qué código estaba corriendo.

## ¿Qué decisiones cambiaría?

- **La de aplicar migraciones a mano.** Es la fuente de la mayor incertidumbre operativa del proyecto: hoy nadie puede afirmar qué esquema corre en producción.
- **La de tener dos proyectos de Netlify** sobre el mismo repositorio. Duplica configuración y garantiza divergencia.
- **La de no crear `.env.example`.** Un desarrollador nuevo no puede arrancar sin preguntar, y `NEXT_PUBLIC_SITE_URL` ni siquiera está documentada.
- **La de mantener `updateApplicationStatus` viva** después de construir `hireWorker()`. Dejar la ruta insegura junto a la segura garantiza que alguien use la equivocada.

## ¿Qué haría durante los próximos 90 días?

**Días 1-14 — Blindaje.** Nada de funcionalidades. Las tres vulnerabilidades críticas, cada una con la prueba que la verifica. Vitest, pruebas de RLS, CI en GitHub Actions con protección de rama. Sentry. Verificar que los backups restauran de verdad. *Al final de estas dos semanas el producto deja de ser destruible.*

**Días 15-35 — Confianza.** Back-office de verificación. Notificaciones por WhatsApp. Bloqueo de conversaciones funcional. Rate limiting global. Mergear los 5 módulos en PRs revisables de verdad. *Al final el producto cumple lo que promete y la contratación se cierra en minutos, no en horas.*

**Días 36-56 — Escala y deuda.** Rendimiento, tipos generados, staging real, migraciones por CLI, onboarding, recuperación de contraseña, Playwright sobre los 3 recorridos críticos. *Al final se puede desplegar sin miedo.*

**Días 57-70 — Beta privada real.** 30 usuarios reales, métricas instrumentadas, iteración semanal. *La pregunta a responder: ¿se quedan en el chat de Chamby o se van a WhatsApp?*

**Días 71-90 — Decisión.** Con datos de beta en la mano, decidir si se invierte en pagos o se pivota. **No construiría pagos antes de tener esa respuesta.**

## ¿En qué invertiría primero?

Si tuviera presupuesto para **una sola cosa**: **un ingeniero senior durante seis semanas dedicado exclusivamente a seguridad y pruebas.** No a funcionalidades. Tres semanas cerrando los críticos con pruebas de RLS y montando CI; tres más en pruebas de integración de los triggers de contratación y recorridos E2E.

**Justificación:** este proyecto no tiene un problema de funcionalidades — tiene más de las que su propio roadmap contemplaba. Tiene un problema de **verificabilidad**. Cada módulo nuevo aumenta la probabilidad de romper uno viejo y nadie lo detectaría. Añadir pagos sobre esta base sería irresponsable: **si hoy se puede forjar reputación, mañana se podrá forjar un cobro.**

Si tuviera presupuesto para **dos**: lo anterior más **la integración de WhatsApp**. En Perú, WhatsApp es el canal por defecto. Hoy un empleador contrata y el trabajador se entera cuando abre la app — si la abre. Es la funcionalidad con mayor retorno directo sobre la conversión de todo el backlog y cuesta cuatro días.

## ¿Qué NO desarrollaría?

1. **Pagos y escrow — todavía.** No hasta cerrar la seguridad y validar en beta que la gente se queda en la plataforma. Construir pagos sobre una base donde la reputación es forjable es multiplicar el riesgo, no el valor.
2. **App móvil nativa.** La PWA cubre el caso y cuesta una fracción.
3. **2FA, modo oscuro, internacionalización.** Sobredimensionados para la etapa.
4. **Geolocalización con PostGIS antes de la beta.** Es un diferenciador, pero no sabemos aún si el problema de los usuarios es encontrar chambas cerca o encontrar chambas fiables. La beta lo dirá.
5. **Más funcionalidades de cualquier tipo durante los primeros 35 días.**

## ¿Qué funcionalidades agregaría antes del lanzamiento?

1. **Back-office de verificación** — sin esto la propuesta de valor no existe.
2. **Notificaciones por WhatsApp** — sin esto la contratación no se cierra.
3. **Onboarding progresivo** — sin esto los perfiles llegan vacíos y todo el sistema de compatibilidad y reputación queda sin insumos.
4. **Recuperación de contraseña** — es un básico y hoy falta.
5. **Bloqueo de conversaciones funcional** — sin esto no hay defensa ante el primer caso de acoso.

## ¿Qué funcionalidades eliminaría?

1. **Las insignias de "Verificado"** — hasta que la verificación exista. O se verifica o no se afirma.
2. **`updateApplicationStatus` / `ApplicantRow`** — la ruta insegura.
3. **Una de las dos rutas de detalle de chamba.**
4. **La pantalla de preferencias de notificación por canal** — o al menos deshabilitar los canales que no existen, en lugar de dejar que el usuario configure algo que no va a ocurrir.
5. **Cuatro de los ocho filtros** de la búsqueda del trabajador, a segundo plano.

## Veredicto

Chamby está **más cerca de lo que parece y más lejos de lo que cree**.

Más cerca porque lo difícil está hecho: el bucle completo del marketplace funciona, el chat en tiempo real es de buena calidad, la identidad de marca es un activo genuino, y el código está lo bastante bien organizado como para que corregirlo sea barato.

Más lejos porque el producto se comporta como si estuviera listo para beta pública cuando su capa de autorización tiene tres brechas explotables desde el primer día, su promesa central de confianza no está implementada, y no existe una sola prueba automatizada que verifique nada de lo anterior.

**Doce semanas de trabajo disciplinado separan a Chamby de un v1.0 lanzable.** Ninguna de esas doce semanas debería dedicarse a funcionalidades nuevas hasta terminar las dos primeras.

---
---

# RESUMEN EJECUTIVO FINAL

## Las 20 recomendaciones más importantes, ordenadas por impacto

*Para decidir qué hacer antes de la Beta Privada.*

### Estado en una línea

Chamby es un marketplace funcional al **72 %** de su MVP, con calidad de producto notable y **tres vulnerabilidades críticas** que permiten a cualquier usuario tomar el control de la plataforma desde la consola del navegador. **Calificación: 6,8/10.** Cerrando las seis primeras recomendaciones de esta lista, sube a **8/10**.

---

### 🔴 BLOQUEANTES — antes de dar acceso a cualquier tester (7 días)

| # | Recomendación | Por qué | Días |
|---|---|---|---|
| **1** | **Cerrar la escalada a administrador** (`profiles_update_own` sin `WITH CHECK` por columna) | Cualquier usuario ejecuta `update profiles set role='admin'` con la anon key pública y toma control total. Puede borrar la base de un producto sin backups verificados | 2 |
| **2** | **Retirar las insignias de "Verificado" o construir el back-office** | Ninguna línea del código aprueba un documento: la verificación no verifica a nadie. Afirmar confianza que no se respalda, en un producto que envía desconocidos a domicilios ajenos, es el riesgo de mayor exposición del proyecto | 0,5 (retirar) / 4 (construir) |
| **3** | **Verificar propiedad en `updateApplicationStatus`** | Un trabajador se auto-contrata en chambas ajenas y desplaza a otros postulantes sin que el empleador lo sepa | 1 |
| **4** | **Validar `rated_id` y exigir `completado` en calificaciones** | Cualquiera con una chamba propia escribe calificaciones contra cualquier perfil. La reputación **es** el producto | 1 |
| **5** | **Sacar `phone` del alcance anónimo** | Los teléfonos de todos los usuarios son legibles sin autenticación. Brecha bajo Ley N.º 29733 y regalo para *scrapers* | 1 |
| **6** | **Una prueba automatizada por cada corrección anterior** | Sin prueba, cada corrección es temporal. Los tres agujeros existen precisamente porque nadie escribió esa prueba | 1,5 |

---

### 🟠 CRÍTICAS DE PROCESO — antes de que crezca la deuda (5 días)

| # | Recomendación | Por qué | Días |
|---|---|---|---|
| **7** | **CI en GitHub Actions** (lint + tsc + build + tests) con protección de rama | 15.941 líneas y cero verificación automática. Es lo único que impide que las 6 correcciones anteriores se reviertan solas | 1 |
| **8** | **Monitoreo de errores (Sentry) + logging** | Hoy los fallos de producción se descubren porque un usuario los reporta | 1 |
| **9** | **Verificar que los backups restauran** y documentar el procedimiento | No basta con que Supabase los tenga: hay que haber probado la restauración antes de necesitarla | 1 |
| **10** | **Migraciones vía Supabase CLI + entorno de staging** | Once migraciones aplicadas a mano sin registro: **nadie sabe qué esquema corre en producción** | 3 |
| **11** | **Trocear la rama de 5 módulos en PRs revisables** | ~8.000 líneas y 5 migraciones acumuladas sin revisión. Cuanto más crece, más caro sale integrarla | 2 |

---

### 🟡 ALTO IMPACTO EN LA BETA — determinan si la beta produce datos útiles (12 días)

| # | Recomendación | Por qué | Días |
|---|---|---|---|
| **12** | **Notificaciones por WhatsApp** | Hoy el trabajador se entera de que lo contrataron solo si abre la app. Mayor retorno sobre conversión de todo el backlog, y en Perú WhatsApp es el canal por defecto | 4 |
| **13** | **Onboarding progresivo tras el registro** (3 pasos) | Sin él los perfiles llegan vacíos, y toda la compatibilidad y reputación se queda sin insumos. La beta arrojará datos contaminados | 3 |
| **14** | **Arreglar el bloqueo de conversaciones** | Escribe en la fila del propio admin y nadie lee `is_blocked`: es un no-op. Única herramienta anti-acoso en un producto que conecta desconocidos | 1 |
| **15** | **Rate limiting global de Server Actions** | Solo el chat lo tiene. Registro, publicación y calificación son scriptables sin límite — y con #4 abierto, permite forjar reputación a escala | 2 |
| **16** | **Recuperación de contraseña** | Ausente. Un tester que olvide su clave queda fuera de la beta permanentemente | 1 |
| **17** | **Corregir `is_active` como señal de "verificado"** | Otorga 15 de 100 puntos de compatibilidad a todos por igual y pinta una insignia falsa. Engaña al empleador en su decisión más importante | 0,5 |

---

### 🟢 ALTO RETORNO, BAJO COSTE — hacer de paso (3 días)

| # | Recomendación | Por qué | Días |
|---|---|---|---|
| **18** | **Resolver el N+1 de `getMessagesUnreadCount`** | N+1 consultas secuenciales en **cada render de página de cada usuario**. Primer cuello de botella que se sentirá | 0,5 |
| **19** | **`next/image` + `remotePatterns` de Google, y `dynamic()` en los 3 componentes pesados** | 7 archivos usan `<img>` directo: sin optimización, sin lazy loading, con CLS. Cero code splitting más allá de rutas | 1,5 |
| **20** | **Unificar el versionado y actualizar README/roadmap** | Cinco versiones contradictorias hacen imposible saber qué código ejecutaba un usuario al reportar un error; el README describe 3 de 11 migraciones y el roadmap ignora 5 módulos | 1 |

---

### Plan mínimo antes de la Beta Privada

| Escenario | Recomendaciones | Duración | Resultado |
|---|---|---|---|
| **Mínimo viable** | #1, #2 (retirar insignias) | **3 días** | Beta cerrada con 10-30 conocidos, advirtiendo del estado del software |
| **Recomendado** | #1 a #11 | **12 días** | Beta privada sólida, con las correcciones protegidas por CI y despliegues reproducibles |
| **Óptimo** | #1 a #20 | **27 días** | Beta que produce datos accionables y prepara directamente la beta pública |

### La pregunta que debe responder la Beta Privada

Por encima de cualquier métrica de producto: **¿qué porcentaje de usuarios se pasa a WhatsApp en cuanto se contratan?**

Si es alto, Chamby pierde el control de la relación y con él la capacidad de monetizar — y ninguna funcionalidad adicional lo arregla. Si es bajo, el chat integrado está reteniendo la transacción y el modelo de negocio es construible. **Esa respuesta vale más que las otras diecinueve métricas juntas**, y debe instrumentarse antes de abrir la beta, no después.

---

*Auditoría realizada el 29 de julio de 2026 sobre `claude/chamby-mvp-redesign-glb9uc` @ `d064a4a`, comparada con `origin/main` @ `bc03549`. Sin modificaciones de código, migraciones, PRs ni configuración.*
