# Informe ejecutivo del estado del proyecto — Chamby

> **Fecha:** 29 de julio de 2026
> **Rama auditada:** `claude/chamby-mvp-redesign-glb9uc` @ `ac390e4`
> **Alcance:** repositorio completo (15.941 líneas TS/TSX · 72 componentes · 11 migraciones SQL · 14 PRs · 4 documentos de diseño previos).
> **Método:** lectura del código fuente, de las 11 migraciones, del historial de git, de los 14 PRs de GitHub y de la documentación; verificación de `tsc --noEmit`, `next lint` y `next build`.
> **Naturaleza:** auditoría crítica. No es un informe de marketing. Los hallazgos de seguridad de la sección 6 son bloqueantes.

---

## Nota preliminar sobre la versión

El proyecto tiene **tres números de versión contradictorios** conviviendo en `main`:

| Fuente | Valor |
|---|---|
| `src/lib/beta-config.ts` (lo que ve el usuario en el Navbar y el Footer) | `v0.6.0` |
| `CHANGELOG.md` (última entrada) | `v0.7.0-beta` |
| `README.md` (título) | `v0.5.0` |
| `package.json` | `1.0.0` |
| Último tag de git | `v0.5.0` |

Este informe adopta **v0.6.0** por ser el valor que la aplicación muestra en producción, pero la primera acción de higiene del proyecto debería ser unificar los cinco. Además, ninguna de las cinco fuentes refleja los **5 módulos ya construidos y sin mergear** (ver §11).

---

# 1. Estado general del proyecto

## 1.1 Avance del MVP

**Avance estimado: 72 %** del alcance funcional del MVP v1.0.

El bucle central del marketplace está **cerrado de punta a punta**: publicar → buscar → postular → preseleccionar → contratar → trabajar → completar → calificar, con chat y notificaciones en tiempo real. Eso es lo difícil y está hecho.

El 28 % restante no es "detalle": son **pagos**, **verificación de identidad operativa**, **pruebas automatizadas** y **corrección de tres fallos de seguridad críticos**. Ninguno es opcional para un producto que mueve dinero entre desconocidos.

| Bloque | Peso | Avance |
|---|---|---|
| Autenticación y perfiles | 10 % | 95 % |
| Publicación y búsqueda de chambas | 15 % | 95 % |
| Postulación → contratación → trabajo en curso | 20 % | 90 % |
| Chat en tiempo real | 12 % | 95 % |
| Notificaciones | 10 % | 60 % (solo in-app) |
| Reputación y calificaciones | 8 % | 70 % (integridad rota, §6) |
| Verificación de identidad | 10 % | 40 % (sin back-office) |
| Pagos / escrow | 10 % | 0 % |
| Panel administrativo | 5 % | 70 % |

## 1.2 Versión actual

**v0.6.0 "Beta Privada"** en `main`, con 5 módulos adicionales terminados en rama sin mergear que corresponderían a una **v0.8.0** de facto.

## 1.3 Estado de estabilidad

**Estable en la superficie, frágil en los cimientos.**

Lo verificable automáticamente está en verde: `tsc --noEmit` limpio con `strict: true`, `next lint` sin warnings, `next build` genera 34 rutas sin errores. La auditoría previa (`docs/AUDITORIA.md`) barrió 36 combinaciones ruta×viewport sin overflow ni errores de hidratación.

Pero **no existe una sola prueba automatizada** en el repositorio — ni unitaria, ni de integración, ni E2E. `package.json` no declara ningún runner. Las "37 pruebas Playwright" mencionadas en el PR #12 se ejecutaron ad-hoc y **no se versionaron**: no son reproducibles ni protegen contra regresiones. La estabilidad actual es una foto, no una garantía.

## 1.4 Calificaciones de preparación

### Beta Privada — **7/10**

**Justificación.** La infraestructura para una beta cerrada existe y está bien pensada: badge de versión, botón flotante de reporte de errores con captura automática de contexto (ruta, navegador, OS, resolución), panel `/admin/beta` con 10 métricas y una guía de 10 escenarios en `/beta`. El flujo funcional completo se puede recorrer.

**Lo que resta 3 puntos:** los fallos de RLS de §6 permiten que **cualquier beta tester se convierta en administrador desde la consola del navegador**. En un grupo cerrado de 10-20 personas conocidas el riesgo es tolerable, pero es una bomba con temporizador y hay que documentárselo explícitamente al grupo. Con las tres correcciones críticas aplicadas, esto sube a 9/10.

### Beta Pública — **4/10**

**Justificación.** El producto aguanta el uso, pero no aguanta usuarios adversariales — y una beta pública los atrae por definición. Los tres fallos críticos (escalada a admin, auto-contratación, forja de reputación) son explotables con `curl` y la anon key, que es pública por diseño. Súmese que los teléfonos de todos los usuarios son legibles sin autenticación (`profiles_select_all using (true)`), lo que en Perú es un problema con la Ley N.º 29733 y una fuente de scraping para spam.

**Bloqueantes:** los 3 críticos + PII de `profiles` + rate limiting global + un runner de pruebas + CI.

### Producción — **3/10**

**Justificación.** Chamby promete conectar desconocidos para trabajo físico presencial. Eso es una responsabilidad seria, y hoy faltan las tres piezas que la sostienen:

1. **Verificación de identidad inoperante.** La tabla `verification_documents` existe, el trabajador puede subir DNI y antecedentes, y la UI muestra insignias de "Verificado" — pero **ninguna línea de código en todo el repositorio cambia el estado de un documento a `verified`**. Solo un admin puede hacerlo vía RLS, y no existe pantalla de administración para ello. Es decir: el módulo de verificación no puede verificar a nadie. Las insignias son decorativas.
2. **Sin pagos.** No hay modelo de ingresos implementado ni escrow. La plataforma no participa de la transacción económica, que es donde ocurre el fraude.
3. **Sin observabilidad.** Cero logging estructurado, cero monitoreo de errores (Sentry o equivalente), cero alertas. Si algo falla en producción, se descubre porque un usuario lo reporta.

Añádase la ausencia de CI/CD, de backups documentados y de un plan de respuesta a incidentes.

---

# 2. Funcionalidades terminadas

| # | Funcionalidad | Estado | Archivos principales | Riesgo actual |
|---|---|---|---|---|
| 1 | Registro / login email+password | **100 %** | `lib/actions/auth.ts`, `components/{Login,Register}Form.tsx` | **Bajo.** Zod, mínimo 8 caracteres, confirmación, distinción "email no confirmado" vs. credenciales |
| 2 | Google OAuth (PKCE) | **100 %** | `app/auth/callback/route.ts`, `components/GoogleAuthButton.tsx`, `0006_auth_hardening.sql` | **Bajo.** Corregido en PR #14 (migración `getAll/setAll`); `/auth/callback` excluido del middleware |
| 3 | Redirect `?next=` sin open redirect | **100 %** | `lib/actions/auth.ts:40` (`safeNextPath`) | **Bajo.** Regex `^\/(?!\/)[^\\]*$` rechaza `//host`, `\` y >500 chars |
| 4 | Protección de rutas server-side | **100 %** | `middleware.ts`, `lib/supabase/middleware.ts` | **Bajo.** `/messages` y `/notifications` no están en el matcher pero se protegen en la página |
| 5 | Publicación de chamba (wizard 4 pasos) | **100 %** | `components/JobWizardForm.tsx`, `lib/actions/jobs.ts`, `0009_job_enhancements.sql` | **Bajo.** Borradores, imágenes, urgencia, requisitos |
| 6 | Galería de imágenes de chamba | **100 %** | `components/jobs/ImageGallery.tsx`, bucket `job-images` | **Medio.** Bucket público con `auth.uid() IS NOT NULL` para subir — cualquier autenticado escribe en cualquier carpeta |
| 7 | Búsqueda pública `/jobs` | **100 %** | `app/jobs/page.tsx`, `components/SearchFilters.tsx` | **Medio.** Interpolación de `q` en filtro PostgREST (§6) |
| 8 | Buscar Chambas (worker, 8 filtros) | **100 %** | `app/dashboard/worker/jobs/page.tsx`, `components/jobs/WorkerFiltersBar.tsx` | **Medio.** Mismo problema de interpolación; orden por compatibilidad limitado a 50 filas |
| 9 | Guardar chambas (bookmarks) | **100 %** | `lib/actions/worker-jobs.ts`, `0010_worker_jobs.sql` | **Bajo** |
| 10 | Postulación con mensaje | **100 %** | `components/ApplyForm.tsx`, `lib/actions/jobs.ts:225` | **Bajo.** UNIQUE `(job_id, worker_id)` evita duplicados |
| 11 | Retiro de postulación | **100 %** | `lib/actions/jobs.ts:159`, `components/WithdrawButton.tsx` | **Bajo.** Verifica dueño y estado |
| 12 | Preselección de postulantes | **100 %** | `lib/actions/applications.ts`, `0011_job_assignments.sql` | **Bajo.** Reversible, con notificación |
| 13 | Contratación multi-vacante | **100 %** | `0011_job_assignments.sql`, `lib/actions/applications.ts:110` | **Medio.** Lógica correcta pero **cero pruebas** sobre un trigger con bloqueo `FOR UPDATE` y condiciones de carrera |
| 14 | Ciclo de vida de la asignación | **100 %** | `components/assignments/AssignmentCard.tsx`, ambas páginas `/assignments` | **Medio.** Misma ausencia de pruebas |
| 15 | Modal de perfil del postulante | **100 %** | `components/employer/WorkerProfileModal.tsx` | **Bajo.** Usa `createAdminClient()` con verificación previa de vínculo y sin exponer `storage_path` |
| 16 | Compatibilidad postulante↔chamba | **100 %** | `lib/compatibility.ts` | **Medio.** El factor "verificado" lee `profile.is_active`, que vale `true` por defecto para todos (§3) |
| 17 | Chat en tiempo real | **100 %** | `components/chat/*` (8), `lib/realtime/useChatRealtime.ts`, `lib/actions/chat.ts` | **Bajo.** El módulo mejor construido del proyecto |
| 18 | Adjuntos de chat (imágenes) | **100 %** | `lib/actions/chat.ts:144`, bucket privado | **Bajo.** URLs firmadas, bucket sin política SELECT |
| 19 | Rate limiting de mensajes | **100 %** | `check_message_rate_limit()` en `0003` | **Bajo.** 30 msg/60 s por usuario por conversación |
| 20 | Centro de notificaciones in-app | **100 %** | `lib/actions/notifications.ts`, `components/notifications/*`, `lib/realtime/useNotifications.ts` | **Bajo.** INSERT restringido a triggers `security definer` — modelo correcto |
| 21 | Calificaciones 1-5 + comentario | **100 %** | `lib/actions/ratings.ts`, `components/Rating{Form,Stars}.tsx` | **CRÍTICO.** `rated_id` no se valida (§6) |
| 22 | Reputación separada worker/employer | **100 %** | `0008_multi_role.sql` (vistas `*_rating_summary`) | **Bajo** |
| 23 | Sistema multi-rol | **100 %** | `lib/actions/roles.ts`, `components/roles/*`, `0008` | **Alto.** Las server actions validan, pero RLS deja escribir `profiles.role` directo (§6) |
| 24 | Perfil profesional (fotos, bio, skills) | **100 %** | `lib/actions/profile.ts`, `components/profile/*`, `0007` | **Bajo** |
| 25 | Panel admin (usuarios, chambas, métricas) | **100 %** | `app/admin/*`, `lib/actions/admin.ts` | **Alto.** `assertAdmin()` es correcto, pero el rol admin es auto-asignable (§6) |
| 26 | Infraestructura Beta | **100 %** | `lib/beta-config.ts`, `lib/actions/beta.ts`, `app/{beta,admin/beta}` | **Bajo** |
| 27 | Reporte de errores in-app | **100 %** | `components/beta/ReportErrorButton.tsx`, `0005_beta.sql` | **Bajo** |
| 28 | SEO (OG, JSON-LD, sitemap, robots) | **100 %** | `app/{sitemap,robots,manifest}.ts`, `app/layout.tsx` | **Bajo.** `JobPosting` elegible para Google Jobs |
| 29 | PWA con offline | **100 %** | `public/sw.js`, `components/RegisterSW.tsx`, `app/offline` | **Bajo.** Network-first, nunca sirve contenido viejo |
| 30 | Design system + marca (hormiguita) | **100 %** | `tailwind.config.ts`, `globals.css`, `components/brand/*` | **Bajo.** Diferenciador real del producto |
| 31 | Páginas legales | **Parcial (60 %)** | `app/{terminos,privacidad}`, `components/LegalPage.tsx` | **Alto.** Todo el texto lleva prefijo `[PROVISIONAL]` — no tiene validez legal |

---

# 3. Funcionalidades parcialmente implementadas

### 3.1 Verificación de identidad — 40 %

**Qué falta.** El back-office completo. Existen la tabla, el bucket privado, la subida de documentos, el enum `document_status` y toda la UI que consume `status === 'verified'`. Falta **la pantalla de administración que revisa un documento y lo aprueba**. Verificado por búsqueda exhaustiva: ninguna línea del repositorio ejecuta un `update` sobre `verification_documents.status`. La política `docs_update_admin` existe pero nadie la usa.

**Consecuencia práctica:** todo documento queda en `pending` para siempre. La insignia "Verificado" nunca aparece. El `trust_score` de `computeAndSaveProfileStats()` tiene un techo de 55/100 para cualquier usuario porque los 45 puntos de documentos son inalcanzables.

**Prioridad: CRÍTICA.** Es la promesa central de confianza del producto y hoy es humo.
**Dependencia técnica:** ninguna. Es una pantalla en `/admin` con `getDocumentDownloadUrl` (ya existe) más una acción `reviewDocument(id, status)` con `assertAdmin()`.

---

### 3.2 Notificaciones multicanal — 60 %

**Qué falta.** El despacho externo. El esquema está diseñado para push/email/SMS/WhatsApp (`channel`, `notification_preferences`, `expires_at`), y `docs/NOTIFICACIONES-DISENO.md` especifica una Edge Function `dispatch-notification`. No se implementó. Tampoco existe la tabla `push_subscriptions` que ese documento contemplaba.

**Consecuencia:** un trabajador solo se entera de que lo contrataron **si abre la aplicación**. En un marketplace de chambas urgentes esto mata la conversión: el empleador contrata, el trabajador no se entera en 6 horas, el empleador cancela.

**Prioridad: ALTA.** Es el factor con mayor impacto directo sobre el negocio de toda la lista.
**Dependencia técnica:** cuenta de Resend (email) y/o proveedor WhatsApp Business API; Supabase Edge Function con webhook de Postgres.

---

### 3.3 Bloqueo de conversaciones — 20 % (roto)

**Qué falta.** Que funcione. `blockConversation()` (`lib/actions/chat.ts:219`) verifica correctamente que el actor sea admin, y luego escribe `is_blocked: true` en la fila de `conversation_settings` **del propio admin**, no en las de los participantes. Además, **ninguna lectura de `is_blocked` existe en todo el código** — `sendMessage()` no lo consulta. El resultado es que bloquear una conversación no bloquea nada.

**Prioridad: ALTA.** Es la única herramienta de moderación sobre acoso en el chat, y no existe.
**Dependencia técnica:** ninguna.

---

### 3.4 Páginas legales — 60 %

**Qué falta.** El texto real. La estructura es correcta y está alineada a la Ley N.º 29733 (derechos ARCO, responsable del tratamiento, finalidad), pero cada párrafo lleva el prefijo literal `[PROVISIONAL]`.

**Prioridad: ALTA** antes de cualquier apertura pública.
**Dependencia técnica:** abogado peruano. No es un problema de ingeniería.

---

### 3.5 Chat en chambas multi-vacante — 50 %

**Qué falta.** `conversations` tiene `UNIQUE (job_id)`. Una chamba con 5 vacantes genera **una sola conversación**, con el primer contratado. Los otros 4 trabajadores no tienen canal con el empleador.

**Prioridad: MEDIA.** Solo afecta chambas con `positions_needed > 1`.
**Dependencia técnica:** migración que cambie a `UNIQUE (job_id, worker_id)` y ajuste `getConversations`.

---

### 3.6 Orden por compatibilidad — 70 %

**Qué falta.** El cálculo es TypeScript puro, no SQL, así que solo puede ordenar lo ya traído: `page.tsx` trae 50 filas, ordena en memoria y **desactiva la paginación**. Con 500 chambas abiertas, el trabajador ordena 50 y cree estar viendo las más compatibles del catálogo.

**Prioridad: MEDIA.**
**Dependencia técnica:** portar `computeCompatibility` a una función SQL `immutable` y ordenar en la base.

---

### 3.7 Semántica de "verificado" — bug de datos

`computeCompatibility` (`lib/compatibility.ts:32`) otorga 15 de 100 puntos por "perfil verificado" leyendo `profile.is_active`. Pero `is_active` significa "cuenta no suspendida" y su valor por defecto es `true`. **Todos los usuarios reciben esos 15 puntos siempre.** `ApplicantCard` arrastra el mismo error al pintar la insignia "Verificado". El factor no discrimina nada; es una constante disfrazada de señal.

**Prioridad: ALTA** (barata de arreglar, y hoy engaña activamente a los empleadores).
**Dependencia técnica:** depende de 3.1 — sin back-office de verificación no hay señal real que leer.

---

# 4. Funcionalidades pendientes

## Prioridad CRÍTICA

| # | Funcionalidad | Justificación |
|---|---|---|
| C1 | **Corregir RLS `profiles_update_own`** para impedir escritura de `role` e `is_active` | Escalada a administrador desde el navegador (§6.1) |
| C2 | **Validación de propiedad en `updateApplicationStatus`** | Un trabajador puede auto-contratarse (§6.2) |
| C3 | **Validar `rated_id` en `submitRating`** | Reputación forjable a voluntad (§6.3) |
| C4 | **Back-office de verificación de documentos** | El módulo de confianza no funciona (§3.1) |
| C5 | **Restringir columnas públicas de `profiles`** | Teléfonos de todos los usuarios legibles sin auth (§6.4) |
| C6 | **Suite de pruebas + CI** | Cero pruebas versionadas sobre lógica financiera y de contratación |

## Prioridad ALTA

| # | Funcionalidad | Justificación |
|---|---|---|
| A1 | Despacho de notificaciones por email/WhatsApp | Sin esto la contratación no se cierra a tiempo (§3.2) |
| A2 | Arreglar el bloqueo de conversaciones | Única herramienta anti-acoso, hoy inerte (§3.3) |
| A3 | Texto legal definitivo | Requisito para abrir al público |
| A4 | Monitoreo de errores (Sentry) + logging | Hoy los fallos de producción son invisibles |
| A5 | Rate limiting global de acciones | Solo el chat lo tiene; postular y publicar no |
| A6 | Endurecer `job_state_history` y `conversations` | Audit trail forjable; DMs no solicitados (§6.6, §6.7) |
| A7 | Cabecera CSP | Ausente en `next.config.js` |
| A8 | Flujo de incidente / disputa | Cancelar una chamba en progreso no tiene proceso |

## Prioridad MEDIA

| # | Funcionalidad |
|---|---|
| M1 | Pagos y escrow (modelo de ingresos) |
| M2 | Geolocalización y búsqueda por radio (PostGIS) |
| M3 | Perfil público del trabajador (URL compartible, SEO) |
| M4 | Chat por asignación en chambas multi-vacante (§3.5) |
| M5 | Compatibilidad calculada en SQL (§3.6) |
| M6 | Resolver el N+1 de `getMessagesUnreadCount` (§8) |
| M7 | Centro de ayuda / FAQ |
| M8 | Panel de moderación de reportes entre usuarios |

## Prioridad BAJA

| # | Funcionalidad |
|---|---|
| B1 | App móvil nativa (la PWA cubre el caso hoy) |
| B2 | `LazyMotion` de Framer Motion (~30 kB) |
| B3 | Regenerar tipos con `supabase gen types` |
| B4 | Internacionalización |
| B5 | Modo oscuro |
| B6 | Analítica de producto |

---

# 5. Arquitectura

## Evaluación por componente

### Next.js 14 App Router — **8/10**

**Fortalezas.** Uso idiomático y disciplinado. Server Components por defecto, `"use client"` solo donde hay interacción real. `loading.tsx` con skeletons en las rutas pesadas. Convenciones de archivo (`sitemap.ts`, `robots.ts`, `manifest.ts`) correctamente aprovechadas. `getCurrentUserAndProfile()` envuelto en `cache()` de React deduplica la consulta de perfil entre Navbar, BottomNav y página en un mismo render — detalle de ingeniería que mucha gente pasa por alto.

**Debilidades.** Sigue en Next 14 con React 18 mientras el ecosistema está en 15/19; la deuda de actualización crece. No se usa `revalidateTag` en ningún lado: todo es `revalidatePath` de grano grueso, que invalida más de lo necesario. `params`/`searchParams` se consumen como objetos síncronos, lo que habrá que migrar cuando se salte a Next 15.

### Supabase — **7/10**

**Fortalezas.** Decisión acertada para este producto y este equipo: Auth, Postgres, RLS, Realtime y Storage en un solo proveedor, sin infraestructura que operar. La separación `createClient()` / `createAdminClient()` es limpia y el service role nunca cruza al cliente.

**Debilidades.** El acoplamiento es total: no hay capa de abstracción sobre `supabase-js`, así que migrar de proveedor implicaría reescribir las 11 server actions y todas las páginas. El tipo `Database` está **escrito a mano** — 180 líneas que se desincronizan del esquema real en silencio, sin que TypeScript lo note. Y el modelo de "la base de datos es dueña de las transiciones de estado" (documentado en `CLAUDE.md`) es defendible, pero concentra la lógica de negocio en triggers PL/pgSQL que **no tienen pruebas ni entorno de staging**.

### Netlify — **6/10**

**Fortalezas.** `netlify.toml` mínimo y correcto con el plugin oficial de Next.js. Deploy previews por PR.

**Debilidades.** Dos proyectos apuntando al mismo repo (`chambyclaudfinal` y `chamby-app`) según `CLAUDE.md` — duplicación de configuración y de variables de entorno, con riesgo real de divergencia. No hay entorno de staging con base de datos propia: los previews apuntan a la misma Supabase que producción, así que **una prueba de beta escribe en datos reales**. No hay pipeline que ejecute `lint`/`tsc`/`build` antes del merge.

### Realtime — **9/10**

Lo mejor del proyecto. Presupuesto explícito de **máximo 2 canales por usuario** (1 de chat + 1 global de notificaciones), decisión de escalabilidad tomada a conciencia y documentada. `useChatRealtime` combina `postgres_changes`, Presence y Broadcast en un único canal; debounce de 1 s en la señal de tipeo con auto-stop a los 3 s; pausa del tracking de presencia vía Page Visibility API cuando la pestaña se oculta. Es ingeniería de calidad.

**Debilidad menor:** el banner de reconexión existe pero no hay backoff exponencial explícito ante caídas prolongadas.

### Server Actions — **7/10**

**Fortalezas.** Patrón consistente: `getUser()` → validar propiedad → validar valores → mutar → `revalidatePath` → devolver `{ success }` o `{ error }`. Zod en los formularios. Los mensajes de error son genéricos hacia el cliente y no filtran detalles internos. La protección CSRF de Next.js (verificación de `Origin`) aplica automáticamente.

**Debilidades.** La calidad **no es uniforme**, y ahí está el problema. `chat.ts` y el nuevo `applications.ts` verifican propiedad rigurosamente; `updateApplicationStatus` y `updateJobStatus` en `jobs.ts` **no verifican nada más que el enum**, delegando en un RLS que resulta ser demasiado permisivo. Toda server action exportada es un endpoint HTTP público: la inconsistencia no es estilística, es una superficie de ataque. Además falta rate limiting en todo lo que no sea el chat.

### Base de datos — **7/10**

Ver §10.

### RLS — **4/10**

**Fortalezas.** Habilitado en las 17 tablas sin excepción. El helper `current_user_role()` es `security definer` y `stable`. Las políticas de `notifications` son ejemplares: SELECT/UPDATE/DELETE solo del dueño y **ningún INSERT para authenticated**, forzando que solo los triggers creen notificaciones.

**Debilidades.** Tres políticas escritas con el criterio de "quién toca la fila" en lugar de "qué puede cambiar de la fila", y eso abre tres agujeros críticos (§6). El error de diseño recurrente: en Postgres, un `UPDATE ... USING (auth.uid() = id)` sin `WITH CHECK` por columna permite al dueño modificar **cualquier columna**, incluida la que define sus privilegios. La nota 4/10 refleja que la única barrera real de autorización del sistema tiene tres brechas explotables.

### Performance — **7/10**

Ver §8.

### Escalabilidad — **6/10**

**Hasta ~10.000 usuarios y ~50.000 chambas** la arquitectura aguanta sin cambios: Postgres con los índices actuales, Realtime con 2 canales por usuario, SSR en Netlify.

**Los techos concretos:**
- `getMessagesUnreadCount()` hace N+1 consultas y corre **en cada render de página** (BottomNav). Con 30 conversaciones son 32 round-trips por navegación. Es el primer cuello que se va a sentir.
- El orden por compatibilidad en memoria no escala más allá de las 50 filas que trae.
- `getConversations()` trae 500 mensajes de golpe para calcular previews y no leídos.
- El plan gratuito/básico de Supabase limita conexiones concurrentes; sin pooler configurado, el SSR con muchos usuarios simultáneos las agota.
- `sitemap.ts` consulta hasta 500 chambas en cada request sin caché.

---

# 6. Seguridad

> **Resumen: 3 vulnerabilidades críticas explotables, 5 altas, 4 medias.** La auditoría previa (`docs/AUDITORIA.md`, julio 2026) concluyó "críticos: 0" porque revisó las server actions sin auditar las políticas RLS columna por columna. Ese es exactamente el mismo tipo de error que ya se documentó con el hallazgo P3 (revisar TypeScript sin revisar SQL), repetido en la dirección contraria.

## 6.1 🔴 CRÍTICO — Escalada de privilegios a administrador

**Dónde:** `supabase/migrations/0001_init.sql:225-228`

```sql
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id or public.current_user_role() = 'admin');
```

No hay cláusula `WITH CHECK` por columna. En Postgres, cuando se omite, se reutiliza el `USING` — y cambiar `role` no viola `auth.uid() = id`. La `NEXT_PUBLIC_SUPABASE_ANON_KEY` es pública por diseño (va en el bundle JS), así que cualquier usuario autenticado puede hacer:

```js
await supabase.from('profiles').update({ role: 'admin' }).eq('id', miId)
```

`current_user_role()` lee `profiles.role`. A partir de ese momento el atacante pasa **las 23 políticas de admin**: borra cualquier chamba, cambia el rol de cualquiera, lee todos los reportes de error, modera conversaciones. `switchRoleAction()` valida contra `user_roles` correctamente, pero es irrelevante: el atacante no usa la server action, va directo al endpoint REST.

**Corolario:** la suspensión de cuentas también es inútil. El admin pone `is_active = false`; el usuario se lo revierte solo.

**Corrección:** política de UPDATE que excluya `role` e `is_active` para no-admin — vía trigger `BEFORE UPDATE` que rechace el cambio si `auth.uid() = id` y `current_user_role() <> 'admin'`, o revocando el privilegio de columna con `GRANT UPDATE (col, ...)`.

## 6.2 🔴 CRÍTICO — Auto-contratación por el trabajador

**Dónde:** `src/lib/actions/jobs.ts:261` + `0001_init.sql:282-289`

```ts
export async function updateApplicationStatus(applicationId: string, status: string) {
  const parsedStatus = applicationStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { error: "Estado inválido." };
  const supabase = createClient();
  const { error, data } = await supabase
    .from("job_applications").update({ status: parsedStatus.data }).eq("id", applicationId)
```

Valida el enum pero **no verifica quién llama**. La política `applications_update` permite `auth.uid() = worker_id`. Un trabajador invoca esta server action con el id de su propia postulación y `"aceptado"`: RLS lo autoriza, y el trigger `handle_application_accepted()` se dispara con `security definer` — lo asigna a la chamba, la pasa a `en_progreso`, rechaza a los demás postulantes y abre el chat. **Todo sin que el empleador se entere.**

La nueva `hireWorker()` en `applications.ts` sí verifica propiedad, pero `updateApplicationStatus` sigue exportada y en uso por `ApplicantRow` en `/jobs/[id]`.

**Corrección:** verificar en la acción que quien llama sea el empleador dueño de la chamba, y restringir la política de UPDATE del trabajador únicamente a la transición `pendiente → retirado`.

## 6.3 🔴 CRÍTICO — Forja de reputación

**Dónde:** `src/lib/actions/ratings.ts:7` + `0001_init.sql:297-306`

```sql
create policy "ratings_insert_participant" on public.ratings for insert
  with check (
    auth.uid() = rater_id
    and (auth.uid() in (select employer_id from public.jobs where jobs.id = job_id)
         or auth.uid() in (select assigned_worker_id from public.jobs where jobs.id = job_id))
  );
```

La política valida **quién califica**, nunca **a quién**. `submitRating` tampoco valida `ratedId` contra los participantes de la chamba, ni exige que la chamba esté `completado`. Consecuencia: cualquiera publica una chamba (es gratis y es su propia chamba, luego pasa el `with check`) y escribe una calificación de 1 a 5 estrellas contra **cualquier perfil de la plataforma**. La restricción `UNIQUE (job_id, rater_id, rated_id)` limita a una por chamba, pero las chambas son ilimitadas. También es posible auto-calificarse con 5 estrellas.

En un marketplace de confianza, la reputación **es** el producto. Esta es la vulnerabilidad de mayor impacto sobre el negocio de las tres.

**Corrección:** exigir en la acción y en la política que `rated_id` sea la contraparte real de la chamba y que `jobs.status = 'completado'`.

## 6.4 🟠 ALTO — Exposición de PII

**Dónde:** `0001_init.sql:220-223` — `create policy "profiles_select_all" ... using (true)`

`profiles` incluye `phone`. La política permite SELECT **sin autenticación**. Con la anon key pública, un script vuelca la tabla completa: nombres, teléfonos, ciudades y oficios de todos los usuarios. Bajo la Ley N.º 29733 de Protección de Datos Personales del Perú esto es una brecha notificable, y comercialmente es un regalo para cualquier competidor o spammer.

**Corrección:** vista pública con las columnas seguras, o política que exponga `phone` solo a la contraparte de una asignación activa.

## 6.5 🟠 ALTO — Ausencia total de pruebas y CI

Sin runner, sin `.github/`, sin gate de merge. Cinco módulos con lógica de dinero y contratación se mergean sobre la palabra de que `npm run build` pasó localmente.

## 6.6 🟠 ALTO — Audit trail forjable

`history_insert_participant` (`0002:110-116`) solo comprueba `actor_id = auth.uid()`. Cualquier usuario inserta entradas arbitrarias en `job_state_history` para cualquier chamba. Un audit trail que el auditado puede escribir no es un audit trail.

## 6.7 🟠 ALTO — Conversaciones no solicitadas

`conversations_insert_employer` (`0002:132-138`) solo exige `employer_id = auth.uid()`. Un usuario crea una conversación consigo mismo como empleador y **cualquier `worker_id`**, sin que exista chamba ni contratación, y le escribe. Vector de spam y acoso directo, agravado porque el bloqueo no funciona (§3.3).

## 6.8 🟠 ALTO — Moderación de chat inoperante

Ver §3.3.

## 6.9 🟡 MEDIO — Inyección de filtros PostgREST

`app/jobs/page.tsx:37` y `app/dashboard/worker/jobs/page.tsx:58` interpolan la búsqueda del usuario en la cadena de filtro:

```ts
query.or(`title.ilike.%${q}%,description.ilike.%${q}%,category.ilike.%${q}%`)
```

No es SQL injection (PostgREST parametriza), pero comas y paréntesis en `q` alteran la estructura del filtro: se pueden inyectar condiciones OR adicionales sobre columnas de `jobs` o provocar errores 400 sistemáticos. El `.eq("status","abierto")` se combina con AND y no se puede evadir, lo que acota la severidad.

**Corrección:** escapar comas, paréntesis y comillas de `q` antes de interpolar.

## 6.10 🟡 MEDIO — Sin CSP

`next.config.js` define `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y `Permissions-Policy`, pero **no `Content-Security-Policy`**. Es la cabecera que más aporta contra XSS y hoy es la que falta.

## 6.11 🟡 MEDIO — Bucket `job-images` permisivo

`0009:74-77`: `INSERT` permitido con solo `auth.uid() IS NOT NULL`, sin verificar la carpeta ni la propiedad de la chamba — a diferencia de `profile-images`, que sí valida `(storage.foldername(name))[1]`. Cualquier autenticado escribe en la carpeta de cualquier chamba. Mismo problema en DELETE.

## 6.12 🟡 MEDIO — Sin rate limiting fuera del chat

Registro, publicación de chambas y postulación no tienen límite. Un script crea miles de chambas o postula a todo el catálogo.

## Calificación por punto

| Punto | Nota | Comentario |
|---|---|---|
| **Auth** | **8/10** | Zod, mínimo 8 caracteres, confirmación de email, mensajes que no filtran si el correo existe |
| **OAuth** | **8/10** | PKCE correcto tras PR #14; `avatar_url` y fallback `name` en el trigger; callback maneja todos los errores |
| **RLS** | **3/10** | Habilitado en todo, pero tres políticas críticas mal delimitadas por columna |
| **SQL** | **8/10** | Todas las funciones con `search_path = public`; sin SQL dinámico; sin concatenación de queries |
| **XSS** | **7/10** | React escapa por defecto; cero `dangerouslySetInnerHTML`; resta la ausencia de CSP |
| **CSRF** | **9/10** | Server Actions de Next 14 verifican `Origin` automáticamente; sin endpoints mutantes fuera de ese mecanismo |
| **Middleware** | **7/10** | Refresco de sesión correcto y `/auth/callback` excluido; `/messages` y `/notifications` fuera del matcher (mitigado en la página) |
| **Cookies** | **9/10** | Gestionadas íntegramente por `@supabase/ssr` con `httpOnly` y `secure`; API `getAll/setAll` actualizada |
| **Server Actions** | **5/10** | Patrón correcto pero aplicado de forma desigual; dos acciones sin verificación de propiedad; sin rate limiting |

**Seguridad global: 4/10.** Los fundamentos están bien elegidos; la ejecución tiene tres brechas que comprometen el sistema entero.

---

# 7. UX/UI

## Diseño — **9/10**

El punto más fuerte del proyecto y su verdadero diferenciador. El sistema de marca de la hormiguita (`components/brand/`) no es un logo pegado: es un lenguaje visual coherente — `AntLoader` (camina sobre una línea punteada en lugar de un spinner genérico), `AntIllustration` con 6 poses contextuales, copys con voz propia ("La hormiguita todavía no encontró ninguna chamba"). Los tokens en `tailwind.config.ts` y las clases `.btn-*`/`.card`/`.input` en `globals.css` están bien delimitados, y `DESIGN_SYSTEM.md` los documenta. Para un marketplace peruano de trabajo temporal, este nivel de identidad es una ventaja competitiva real.

## Responsive — **9/10**

Verificado en la auditoría previa: 36/36 combinaciones ruta×viewport (320/360/393/768/1366/1920 px) sin overflow horizontal ni errores de hidratación. Mobile-first genuino, con BottomNav de 5 pestañas, safe-area para iOS y botón flotante central de publicar. Dado que el público objetivo es predominantemente móvil, es la decisión correcta.

## Accesibilidad — **7/10**

**Bien:** contraste AA verificado y corregido (`slate-400` → `slate-500`), skip link con landmark, `aria-*` en 56 de 72 componentes, `useReducedMotion` respetado en `Reveal` y `AntLoader`, targets táctiles de 44 px, focus visible global.

**Falta:** el `WorkerProfileModal` cierra con Escape y bloquea el scroll del body, pero **no atrapa el foco ni lo devuelve al disparador** al cerrar — un usuario de teclado se pierde. `ApplicationTimeline` es un `<ol>` sin `aria-current` para el paso activo. Ningún flujo se ha probado con lector de pantalla real.

## Navegación — **8/10**

Jerarquía clara y coherente entre desktop (Navbar) y móvil (BottomNav), con badges en vivo de mensajes y notificaciones. El nuevo enlace "Postulantes" desde `EmployerJobRow` cierra un hueco importante.

**Problema:** dos rutas de detalle de chamba conviviendo — `/jobs/[id]` (pública, con acciones de empleador) y `/dashboard/worker/jobs/[id]` (privada, del trabajador). Se solapan y el usuario puede llegar a cualquiera de las dos desde distintos puntos, viendo interfaces diferentes para la misma chamba.

## Onboarding — **4/10**

El punto débil de la experiencia. Tras registrarse, el usuario cae en un dashboard vacío sin ninguna guía. No hay tour, ni checklist de primeros pasos, ni sugerencia de completar el perfil. Para el trabajador esto es grave: su compatibilidad y su credibilidad dependen enteramente de un perfil que nadie le pide llenar. `ProfileCompletionBar` existe pero está enterrado en `/dashboard/worker/profile`, donde solo llega quien ya sabe que existe.

## Facilidad de uso — **8/10**

El wizard de publicación en 4 pasos con vista previa es excelente. Las confirmaciones inline (en lugar de `window.confirm`) son elegantes. Los estados vacíos orientan en vez de frustrar.

**Fricción detectada:** la barra de filtros del trabajador tiene 8 filtros más orden — demasiado para un móvil; el orden se aplica solo pero los demás exigen pulsar "Buscar", lo que rompe la expectativa.

## Mejoras propuestas

1. **Onboarding progresivo tras el registro** (impacto alto, esfuerzo bajo): 3 pasos — foto → oficio y habilidades → ciudad — con barra de progreso. Ataca directamente el problema de perfiles vacíos.
2. **`ProfileCompletionBar` en el dashboard**, no escondida en el perfil, con CTA al campo faltante.
3. **Unificar el detalle de chamba** en una sola ruta que adapte las acciones al rol.
4. **Focus trap en el modal** de perfil del postulante.
5. **Filtros en drawer inferior** en móvil, con contador de filtros activos.
6. **Estados vacíos accionables por filtro**: cuando una búsqueda no arroja nada, sugerir cuál filtro relajar.
7. **Confirmación de contratación con más peso**: hoy es una franja inline; contratar es la decisión de mayor consecuencia del producto y merece un diálogo con el resumen de lo que va a ocurrir.

---

# 8. Rendimiento

## Bundle — **8/10**

First Load JS compartido: **87,2 kB**. Rutas más pesadas: `/messages/[conversationId]` 233 kB, `/register` 213 kB, `/login` 203 kB. Las páginas nuevas de contratación quedan en 152-154 kB. Son cifras razonables para una app con Framer Motion.

**Optimizable:** Framer Motion se importa completo (~30 kB gz); migrar a `LazyMotion` + `m.` ahorraría ~20 kB globales. `lucide-react` tiene tree-shaking, pero conviene auditar los iconos realmente usados. Login y registro a 200+ kB es alto para pantallas tan simples.

## SSR — **8/10**

Todas las rutas dinámicas se renderizan en servidor bajo demanda (`ƒ`), lo cual es correcto porque casi todo depende de sesión. `getCurrentUserAndProfile()` cacheado con `cache()` de React evita las consultas duplicadas entre layout y página. Las consultas independientes van en `Promise.all` de forma consistente.

**Debilidad:** ninguna ruta pública aprovecha ISR. `/jobs` y `/jobs/[id]` son las páginas indexables y podrían servirse con `revalidate` de 60 s, ahorrando SSR y mejorando el TTFB para tráfico de buscadores.

## Imágenes — **5/10**

Solo 2 archivos usan `next/image`; **7 usan `<img>` directo**. Está documentado el porqué (los avatares de Google vienen de `lh3.googleusercontent.com`, fuera de `remotePatterns`, y `next/image` los rompería), pero la consecuencia es real: sin optimización, sin `srcset`, sin lazy loading nativo, sin dimensiones reservadas — lo que produce CLS. Afecta a la galería de chambas, a la galería del modal de perfil y a todos los avatares.

**Corrección:** añadir `lh3.googleusercontent.com` a `remotePatterns` y migrar a `next/image`. Es media hora de trabajo con impacto directo en Core Web Vitals.

## Consultas — **6/10**

**Bien:** paginación por cursor en mensajes y notificaciones; `Promise.all` sistemático; `count: "exact", head: true` para conteos sin traer filas; joins con hint de FK explícito.

**Mal — el peor problema de rendimiento del proyecto:**

```ts
// lib/actions/notifications.ts:166
for (const conv of convIds) {
  const { count } = await query;   // una consulta por conversación
  total += count ?? 0;
}
```

`getMessagesUnreadCount()` ejecuta N+1 consultas **secuenciales** y se invoca desde `BottomNav`, es decir **en cada render de página de cada usuario**. Con 20 conversaciones son 22 round-trips antes de pintar. Es resoluble con una sola consulta agregada o una función Postgres.

También: `getConversations()` trae 500 mensajes de una vez para calcular previews y no leídos; y el orden por compatibilidad trae 50 chambas para ordenarlas en memoria.

## Índices — **7/10**

Bien cubiertos `jobs` (city, category, status, employer), `job_applications` (job, worker), `messages` (conversación+fecha, sender, índice parcial de no leídos), `notifications` (índice parcial de no leídas — muy buena decisión), `job_assignments` (job, worker, employer) y `saved_jobs`.

**Faltan:** índice compuesto `(status, created_at desc)` en `jobs`, que es exactamente el patrón de la consulta de listado más frecuente; índice en `ratings(job_id)`; índice trigram (`pg_trgm`) para los `ILIKE %texto%` de la búsqueda, que hoy hacen scan secuencial.

## Realtime — **9/10**

Presupuesto de 2 canales por usuario, debounce de tipeo, pausa por Page Visibility. Bien diseñado y bien acotado.

## Tiempos de carga — **7/10**

Con `loading.tsx` y skeletons la percepción es buena. El TTFB real depende de la latencia a Supabase (probablemente `us-east-1`) desde Perú: ~120-180 ms por consulta, que se acumulan en las páginas con muchas consultas dependientes.

## Optimizaciones priorizadas

| # | Optimización | Impacto | Esfuerzo |
|---|---|---|---|
| 1 | Colapsar el N+1 de `getMessagesUnreadCount` en una consulta | **Alto** | Bajo |
| 2 | Migrar `<img>` → `next/image` + `remotePatterns` de Google | **Alto** | Bajo |
| 3 | Índice `(status, created_at desc)` en `jobs` | Medio | Muy bajo |
| 4 | ISR de 60 s en `/jobs` y `/jobs/[id]` | Medio | Bajo |
| 5 | `LazyMotion` de Framer Motion | Medio | Medio |
| 6 | `pg_trgm` para la búsqueda por texto | Medio | Bajo |
| 7 | Caché del sitemap | Bajo | Muy bajo |

---

# 9. Código

## Organización — **9/10**

Estructura ejemplar y predecible: `app/` por rutas, `components/` agrupados por dominio (`chat/`, `brand/`, `ui/`, `profile/`, `roles/`, `jobs/`, `employer/`, `assignments/`, `notifications/`, `beta/`), `lib/actions/` una acción por dominio, `lib/realtime/` para hooks, `lib/supabase/` para los tres clientes. Cualquiera encuentra dónde va algo sin preguntar.

## Mantenibilidad — **7/10**

**Bien:** `strict: true` sin `any` sueltos; nomenclatura en español consistente con el dominio; comentarios que explican **por qué** y no qué (el de `Relationships: []` en `types.ts` documenta un comportamiento no obvio de supabase-js que ahorra horas); `CLAUDE.md` transmite el conocimiento arquitectónico no evidente.

**Mal:** el `as unknown as T` está por todas partes — más de 40 apariciones — porque el tipo `Database` está escrito a mano y no siempre coincide con lo que devuelve `supabase-js`. Cada uno de esos casts es un punto donde el compilador deja de protegerte. Y la lógica de negocio vive repartida entre triggers PL/pgSQL y server actions, así que entender una regla exige leer los dos lados.

## Deuda técnica — **6/10**

| Deuda | Gravedad |
|---|---|
| Cero pruebas automatizadas | **Crítica** |
| Tipo `Database` a mano (180 líneas) + 40 casts `as unknown as` | Alta |
| `ApplicantRow` y `ApplicantCard` resuelven lo mismo con criterios de seguridad distintos | Alta |
| Dos rutas de detalle de chamba solapadas | Media |
| `CHANGELOG`/`README`/`beta-config`/`package.json`/tags desincronizados | Media |
| README documenta 3 migraciones cuando hay 11 | Media |
| `docs/NOTIFICACIONES-DISENO.md` especifica tablas que no se implementaron | Media |
| 12 ramas locales sin limpiar | Baja |
| `tsconfig.tsbuildinfo` versionado | Baja |

## Duplicación — **6/10**

Casos reales detectados:
- **Gestión de postulantes duplicada**: `ApplicantRow` (en `/jobs/[id]`) y `ApplicantCard` (en `/dashboard/employer/.../applications`) hacen lo mismo con caminos distintos — y el primero usa la acción insegura de §6.2.
- **Detalle de chamba duplicado**: `/jobs/[id]` y `/dashboard/worker/jobs/[id]` comparten estructura y consultas.
- **Preámbulo repetido**: `createClient()` + `getUser()` + guarda de sesión se repite en las ~40 server actions. Un helper `withAuth()` lo eliminaría.
- **Consulta de resumen de calificaciones** replicada en 5 páginas.

## Componentes — **8/10**

72 componentes con buena separación servidor/cliente y `"use client"` empujado a las hojas del árbol. `EmptyState`, `Badge`, `StatCard`, `Avatar` y `Skeleton` son primitivas bien diseñadas y efectivamente reutilizadas.

**Reparo:** `ChatWindow` y `JobWizardForm` son componentes grandes que concentran demasiada responsabilidad.

## Estructura — **8/10**

Consistente y escalable. La convención de `loading.tsx` por ruta se aplica de forma dispareja (existe en 8 de 15 rutas dinámicas).

## Calificación de código: **7,5/10**

Código de buen nivel, escrito con criterio y bien organizado. Lo que lo separa de un 9 no es el estilo sino la ausencia de red de seguridad: sin pruebas y con 40 casts que anulan al compilador, la calidad depende enteramente de que quien edite recuerde el contexto completo.

---

# 10. Base de datos

## Tablas — 17

`profiles`, `jobs`, `job_images`, `job_applications`, `job_assignments`, `saved_jobs`, `job_state_history`, `conversations`, `messages`, `conversation_read_cursors`, `conversation_settings`, `message_audit_log`, `notifications`, `notification_preferences`, `ratings`, `user_roles`, `profile_photos`, `verification_documents`, `profile_stats`, `bug_reports`. Más 4 vistas de resumen de calificaciones.

**Evaluación: 8/10.** Modelo normalizado, nombres claros, dominio bien representado. Todas las migraciones son aditivas — 11 archivos sin una sola operación destructiva, lo cual es notable.

## Relaciones — **8/10**

Claves foráneas correctas con `on delete cascade` donde corresponde y `set null` donde borrar en cascada perdería historia (`assigned_worker_id`, `bug_reports.user_id`). Restricciones `UNIQUE` bien puestas: `(job_id, worker_id)` en postulaciones y asignaciones, `(job_id, rater_id, rated_id)` en calificaciones, `(user_id, role)` en roles.

**Problemas:**
- `UNIQUE (job_id)` en `conversations` bloquea el chat multi-vacante (§3.5).
- `jobs.assigned_worker_id` quedó como columna heredada del modelo de un solo trabajador; ahora convive con `job_assignments` como fuente real, y ese solapamiento va a confundir.
- `message_audit_log.message_id` no tiene FK (deliberado, porque el mensaje se borra) pero tampoco índice.

## Índices — **7/10**

Ver §8. Destaca el uso de índices parciales (`notifications` no leídas, `messages` sin leer, foto principal única por perfil) — es una técnica que poca gente aplica y aquí está bien usada.

## Triggers — **7/10**

**Fortalezas.** `handle_application_accepted()` es el corazón del sistema y está bien construido: bloqueo `FOR UPDATE` contra condiciones de carrera, guarda de vacantes que lanza excepción (y por tanto revierte la transacción), atomicidad en la creación de conversación e historial. Los 5 triggers de notificación son `security definer` y garantizan que ningún cliente pueda fabricar notificaciones. `handle_new_user()` tiene `on conflict do nothing` como red de seguridad.

**Debilidades.** **Ninguno tiene pruebas.** Un trigger que decide contrataciones, rechaza postulantes en masa y abre canales de comunicación, sin una sola prueba, es el riesgo técnico más concreto del proyecto. Además `notify_assignment_status_changed()` usa `auth.uid()` para decidir a quién notificar en la rama de cancelación: si algún día ese trigger se dispara desde un contexto sin JWT (una tarea programada, una corrección manual), notificará a quien no es.

## RLS — **4/10**

Ver §6. Cobertura del 100 % de las tablas; tres políticas con delimitación por columna incorrecta que abren tres agujeros críticos.

## Escalabilidad — **6/10**

Sin particionado ni política de retención. `messages` y `notifications` crecen sin límite; el comentario de `0004` propone borrar notificaciones de más de 90 días con un cron externo, pero no está implementado. Sin réplicas de lectura ni pooler configurado.

## Mejoras propuestas

| # | Mejora | Prioridad |
|---|---|---|
| 1 | Corregir las 3 políticas RLS críticas (§6.1-6.3) | **Crítica** |
| 2 | Restringir columnas públicas de `profiles` (§6.4) | **Crítica** |
| 3 | Pruebas de los triggers (pgTAP o integración) | **Crítica** |
| 4 | `WITH CHECK` explícito en toda política de UPDATE | Alta |
| 5 | Bloquear escritura de `job_state_history` a triggers | Alta |
| 6 | Exigir vínculo de contratación en `conversations_insert` | Alta |
| 7 | `UNIQUE (job_id, worker_id)` en `conversations` | Media |
| 8 | Índice `(status, created_at desc)` en `jobs` + `pg_trgm` | Media |
| 9 | Retención automática de notificaciones (pg_cron) | Media |
| 10 | Migrar a Supabase CLI (`db push`) en vez del SQL Editor | Media |
| 11 | Deprecar `jobs.assigned_worker_id` en favor de `job_assignments` | Baja |

## Riesgo operativo de las migraciones

`README.md` y todos los PRs instruyen aplicar las migraciones **a mano en el SQL Editor de Supabase**. No hay `supabase/config.toml`, ni `db push`, ni registro de versión aplicada. Con 11 migraciones y sin entorno de staging, **nadie puede afirmar con certeza qué esquema está corriendo en producción**. Este es el riesgo operativo más subestimado del proyecto: un despliegue de código que asume una migración no aplicada produce errores en tiempo de ejecución que no aparecen en ningún build.

---

# 11. Roadmap: planificado vs. real

## Roadmap original (`README.md` §8)

| Fase | Descripción | Estado declarado | **Estado real** |
|---|---|---|---|
| 1 | Flujo de contratación completo | ✅ v0.4.0 | ✅ **Completado y superado** — v0.8.0-rama añade preselección y multi-vacante |
| 2 | Chat en tiempo real | ✅ v0.5.0 | ✅ **Completado** |
| 3 | Centro de notificaciones (push, email, in-app) | 🔜 Próximo | 🟡 **Parcial** — solo in-app; push y email sin implementar |
| 4 | Perfil público del trabajador | Planificado | 🟡 **Parcial** — perfil profesional existe; falta URL pública compartible |
| 5 | Búsqueda avanzada y geolocalización | Planificado | 🟡 **Parcial** — 8 filtros y compatibilidad; sin geolocalización |
| 6 | Verificación de identidad | Planificado | 🟡 **Parcial** — subida sí, aprobación no (§3.1) |
| 7 | Pagos y escrow | Planificado | ⬜ **Pendiente** — 0 % |
| 8 | App móvil (PWA mejorada) | Planificado | 🟡 **Parcial** — PWA instalable con offline |

## Lo entregado fuera del roadmap

El roadmap **no contemplaba** cinco módulos que sí se construyeron: infraestructura de Beta Privada (v0.7.0-beta), sistema multi-rol (worker+employer en una cuenta), wizard de publicación en 4 pasos con imágenes, guardado de chambas y el sistema completo de asignaciones. El proyecto avanzó más de lo que su propio roadmap dice, y en direcciones distintas.

## Resumen

**✅ Completado (5):** contratación · chat · design system y marca · panel admin · infraestructura beta.

**🟡 En progreso (5):** notificaciones (60 %) · verificación (40 %) · perfil público (60 %) · búsqueda avanzada (80 %) · PWA (70 %).

**⬜ Pendiente (4):** pagos y escrow · geolocalización · app nativa · centro de ayuda.

## El problema de proceso

`CLAUDE.md` establece: *"una rama por PR, un objetivo claro por PR, `main` siempre estable/desplegable"*. La realidad de `git log origin/main..HEAD`:

```
ac390e4  feat: preselección, contratación multi-vacante y trabajo en curso
8a1aa44  feat: Buscar Chambas + Postular
8f8521c  feat: Publicar una Chamba
fa5b0c9  feat: sistema multi-rol
0b2192b  feat: Perfil Profesional Verificado
```

**Cinco módulos independientes acumulados en una sola rama**, sin PR abierto, sin revisar, sin desplegar. Esa rama toca 11 migraciones de base de datos y añade ~8.000 líneas. Es exactamente lo que la propia guía del repositorio prohíbe, y el riesgo es acumulativo: cuanto más crece, menos revisable es y más caro sale integrarla. Los PRs #1-#14 se hicieron bien; los últimos cinco módulos abandonaron el proceso.

---

# 12. Riesgos

## 🔴 Críticos

| # | Riesgo | Impacto | Probabilidad | Mitigación |
|---|---|---|---|---|
| R1 | **Escalada a admin vía RLS** (§6.1) | Compromiso total: borrado de datos, cambio de roles, acceso a todo | **Alta** — trivial de descubrir | `WITH CHECK` por columna o trigger de guarda |
| R2 | **Auto-contratación** (§6.2) | Trabajadores se asignan chambas ajenas; empleadores pierden control | **Alta** | Verificar propiedad en la acción + acotar la política |
| R3 | **Forja de reputación** (§6.3) | Destruye la confianza, que es el activo del marketplace | **Media-alta** | Validar `rated_id` y exigir `completado` |
| R4 | **Verificación inoperante** (§3.1) | La app promete trabajadores verificados y no verifica a nadie. Si ocurre un incidente físico entre desconocidos, la exposición legal es directa | **Alta** | Back-office de aprobación de documentos |
| R5 | **Cero pruebas sobre lógica de contratación** | Una regresión silenciosa en `handle_application_accepted()` puede contratar mal o rechazar postulantes válidos sin que nadie lo note | **Alta** | Suite de integración sobre los triggers |
| R6 | **Deriva de esquema** (§10) | Nadie sabe qué migraciones están aplicadas en producción | **Alta** | Supabase CLI + entorno de staging |

## 🟠 Altos

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R7 | Exposición de teléfonos sin auth (§6.4) | Brecha bajo Ley 29733 + scraping para spam | Vista pública con columnas seguras |
| R8 | Moderación de chat inoperante (§3.3) | Acoso sin herramienta de contención | Implementar el bloqueo de verdad |
| R9 | Notificaciones solo in-app (§3.2) | El trabajador no se entera de que lo contrataron | Email/WhatsApp |
| R10 | Textos legales `[PROVISIONAL]` | Sin protección contractual ante disputas | Abogado peruano |
| R11 | Sin monitoreo de errores | Los fallos de producción son invisibles | Sentry |
| R12 | Rama de 5 módulos sin mergear (§11) | Conflictos crecientes; revisión impracticable | Trocear en PRs revisables |
| R13 | Dependencia total de Supabase | Un cambio de precios o de política obliga a reescribir | Aceptar conscientemente; documentar el coste de salida |
| R14 | Sin backups documentados | Pérdida de datos sin plan de recuperación | Verificar PITR y documentar el procedimiento |

## 🟡 Medios

| # | Riesgo |
|---|---|
| R15 | N+1 en `getMessagesUnreadCount` degrada todas las páginas al crecer las conversaciones |
| R16 | `is_active` usado como "verificado" engaña a los empleadores (§3.7) |
| R17 | Sin rate limiting fuera del chat |
| R18 | Ausencia de CSP |
| R19 | Chat multi-vacante roto |
| R20 | Sin modelo de ingresos: no hay validación de que el negocio funcione |
| R21 | Deuda de actualización a Next 15 / React 19 |
| R22 | Bus factor de 1: un solo autor humano y todo el contexto en `CLAUDE.md` |

## 🟢 Bajos

| # | Riesgo |
|---|---|
| R23 | Versionado inconsistente en 5 fuentes |
| R24 | `<img>` sin optimizar afecta Core Web Vitals |
| R25 | 12 ramas locales sin limpiar |
| R26 | Documentación desactualizada (README con 3 de 11 migraciones) |
| R27 | Bundle de Framer Motion sin `LazyMotion` |

---

# 13. Recomendaciones

## Qué eliminaría

**1. `updateApplicationStatus` y `ApplicantRow`.**
No es solo duplicación: es la ruta insegura de §6.2 conviviendo con la segura. Mientras existan las dos, alguien va a mantener la equivocada. `applications.ts` ya cubre todos los casos con verificación de propiedad. *Justificación: eliminar la ruta insegura es más fiable que recordar no usarla.*

**2. Una de las dos rutas de detalle de chamba.**
`/jobs/[id]` es la pública e indexable; `/dashboard/worker/jobs/[id]` debería redirigir a ella. *Justificación: dos vistas de la misma entidad divergen con el tiempo y duplican cada corrección.*

**3. `jobs.assigned_worker_id`.**
`job_assignments` es la fuente completa desde la migración 0011. Mantener las dos garantiza que algún día se desincronicen. Deprecar por fases: dejar de leerla, luego dejar de escribirla, luego borrarla. *Justificación: dos fuentes de verdad para el mismo hecho siempre terminan en contradicción.*

**4. El tipo `Database` escrito a mano.**
180 líneas y 40 casts `as unknown as` que se desincronizan en silencio. `supabase gen types typescript` lo genera correcto. *Justificación: el compilador solo protege si el tipo es cierto; hoy no hay garantía de que lo sea.*

**5. Las 12 ramas locales muertas.**

## Qué agregaría

**1. Suite de pruebas y CI — antes que cualquier otra funcionalidad.**
Vitest para lógica pura (`compatibility.ts`, `utils.ts`, `safeNextPath`), pruebas de integración contra una Supabase local para triggers y RLS, y Playwright para los 3 recorridos críticos (registrarse → postular; publicar → contratar → completar; enviar mensaje). GitHub Actions con `lint` + `tsc` + `build` + tests como requisito de merge. *Justificación: es lo único que convierte "funciona hoy" en "seguirá funcionando". Sin esto, cada módulo nuevo aumenta la probabilidad de romper uno viejo, y con 15.000 líneas ya nadie puede verificarlo todo a mano.*

**2. Pruebas específicas de RLS.**
Un archivo que, por cada tabla, intente el acceso indebido y falle si tiene éxito. Los tres críticos de §6 existen precisamente porque nadie escribió esa prueba. *Justificación: RLS es la única barrera de autorización del sistema; probar todo menos la barrera es probar lo que menos importa.*

**3. Entorno de staging con su propia Supabase.**
Hoy los deploy previews escriben en la base de producción. *Justificación: no existe forma segura de probar una migración, y las migraciones son el cambio más peligroso que se hace en este proyecto.*

**4. Back-office de verificación.**
Una pantalla en `/admin`: lista de documentos pendientes, visor con URL firmada, botones aprobar/rechazar con motivo. *Justificación: desbloquea el módulo entero de confianza — el diferenciador frente a contratar por Facebook Marketplace.*

**5. Sentry + logging estructurado.**

**6. Notificaciones por WhatsApp.**
En Perú, WhatsApp es el canal por defecto. Es probablemente la funcionalidad con mayor retorno de toda la lista. *Justificación: el email tiene tasas de apertura bajas en este segmento; WhatsApp cierra el bucle de contratación en minutos en lugar de horas.*

## Qué simplificaría

**1. Los 8 filtros de la búsqueda del trabajador → 4.**
Palabra clave, ciudad, categoría, urgencia. Distrito, tipo de pago, rango de pago y fecha detrás de "más filtros". *Justificación: en un móvil, 8 filtros no producen mejores búsquedas, producen abandono.*

**2. Un helper `withAuth()` para las server actions.**
El bloque `createClient()` + `getUser()` + guarda se repite ~40 veces. *Justificación: además de reducir ruido, un único punto de entrada es el lugar natural donde añadir rate limiting y logging después.*

**3. Un solo número de versión.**
`package.json` como fuente única; `beta-config.ts` lo lee. *Justificación: cinco versiones distintas hacen imposible saber qué está desplegado cuando llega un reporte de error.*

**4. Consolidar los 4 documentos de diseño.**
`FLUJO-CONTRATACION.md`, `NOTIFICACIONES-DISENO.md` y `PRESELECCION-Y-ASIGNACIONES.md` describen partes del mismo flujo y ya se contradicen entre sí en algunos puntos.

## Qué automatizaría

| # | Automatización | Justificación |
|---|---|---|
| 1 | **CI: lint + tsc + build + tests en cada PR** | Hoy la verificación depende de que alguien recuerde ejecutarla |
| 2 | **Migraciones vía Supabase CLI** | Aplicarlas a mano es la mayor fuente de deriva entre entornos |
| 3 | **Generación de tipos desde el esquema** | Elimina de raíz los 40 casts inseguros |
| 4 | **Limpieza de notificaciones >90 días (pg_cron)** | Ya está especificado en `0004` como comentario; falta ejecutarlo |
| 5 | **Cálculo de `profile_stats` por trigger** | Hoy depende de que el cliente llame a la acción; si no la llama, el score queda obsoleto |
| 6 | **Escaneo de dependencias (Dependabot)** | 12 dependencias de producción sin vigilancia de CVEs |
| 7 | **Presupuesto de Lighthouse en CI** | Evita que el bundle crezca sin que nadie lo note |

## Qué cambiaría antes del lanzamiento

**Bloqueantes absolutos:**

1. Las tres vulnerabilidades críticas de §6. *No negociable: la primera permite a cualquiera destruir la plataforma.*
2. Restringir la exposición de teléfonos. *Obligación legal bajo Ley 29733.*
3. Back-office de verificación funcionando. *Anunciar "trabajadores verificados" sin verificar a nadie es publicidad engañosa, y ante un incidente físico la responsabilidad es directa.*
4. Textos legales reales. *Sin términos válidos no hay defensa contractual.*
5. Pruebas de los recorridos críticos. *Lanzar lógica de contratación sin pruebas es apostar.*
6. Monitoreo de errores. *Sin él, el primer fallo grave se conoce por Twitter.*

**Fuertemente recomendados:**

7. Notificaciones por WhatsApp o email.
8. Bloqueo de conversaciones funcional.
9. Rate limiting global.
10. Onboarding tras el registro.

---

# 14. Auditoría de calidad

| Dimensión | Nota | Explicación |
|---|---|---|
| **Arquitectura** | **7,5/10** | Decisiones acertadas para el contexto: App Router bien usado, separación limpia de clientes Supabase, presupuesto explícito de canales Realtime. Resta el acoplamiento total al proveedor sin capa de abstracción, la lógica de negocio repartida entre triggers y TypeScript sin un criterio explícito de qué va dónde, y la ausencia de staging |
| **Código** | **7,5/10** | Organización ejemplar, `strict: true` sin `any`, comentarios que explican el porqué, nomenclatura coherente. Penalizan los 40 casts `as unknown as` que anulan al compilador y la duplicación de la gestión de postulantes con criterios de seguridad distintos |
| **Seguridad** | **4/10** | Los fundamentos están: RLS en el 100 % de tablas, `security definer` con `search_path`, service role aislado, CSRF nativo, sin open redirect. Pero tres políticas mal delimitadas por columna permiten hacerse administrador, auto-contratarse y forjar reputación. La nota refleja el sistema resultante, no la intención |
| **Performance** | **7/10** | Bundle razonable (87 kB compartidos), `Promise.all` consistente, paginación por cursor, índices parciales bien aplicados. Penalizan el N+1 en cada render de página, `<img>` sin optimizar y el orden por compatibilidad en memoria |
| **UX** | **8,5/10** | El punto más fuerte: identidad de marca genuina, responsive verificado en 6 viewports, contraste AA, `useReducedMotion`, estados vacíos con voz propia, wizard de publicación excelente. Restan el onboarding inexistente y el focus trap faltante en el modal |
| **Escalabilidad** | **6/10** | Aguanta ~10.000 usuarios sin cambios. Los techos son concretos y conocidos: N+1 en mensajes, orden en memoria, sin particionado ni retención, sin pooler, sin réplicas de lectura |
| **Mantenibilidad** | **6,5/10** | Estructura predecible y `CLAUDE.md` transmite bien el contexto. Pero sin una sola prueba, con tipos a mano desincronizables y con la lógica de negocio dividida entre SQL y TS, mantener exige recordar todo el sistema. No escala a un segundo desarrollador |
| **Documentación** | **7,5/10** | Muy por encima de la media: CHANGELOG detallado, 5 documentos de diseño, `CLAUDE.md`, `DESIGN_SYSTEM.md`, PRs con descripciones ejemplares, y una corrección de auditoría documentada honestamente (P3). Penaliza que esté desactualizada: README con 3 de 11 migraciones, roadmap que ignora 5 módulos, versión en 5 valores distintos, y documentos de diseño que especifican tablas nunca implementadas |

## **Nota global: 6,8/10**

Un producto con muy buen criterio de producto y diseño, código bien organizado, y **dos brechas graves**: la seguridad de la capa de autorización y la ausencia total de verificación automatizada. Ninguna de las dos es difícil de cerrar; ambas son bloqueantes para operar con usuarios reales.

---

# 15. Plan para MVP v1.0

## v0.7.0 — "Blindaje" · 2 semanas · Dificultad media · Impacto CRÍTICO

**Objetivo:** que el producto no pueda ser destruido por un usuario con la consola del navegador abierta.

| Tarea | Días |
|---|---|
| Corregir `profiles_update_own` (bloquear `role` e `is_active`) | 1 |
| Verificación de propiedad en `updateApplicationStatus`; eliminar `ApplicantRow` | 1 |
| Validar `rated_id` y exigir `completado` en calificaciones | 1 |
| Vista pública de `profiles` sin `phone` | 1 |
| Endurecer `job_state_history`, `conversations` y bucket `job-images` | 1 |
| Escapar `q` en los filtros PostgREST | 0,5 |
| Cabecera CSP | 0,5 |
| Vitest + pruebas de RLS (una por vulnerabilidad corregida) | 3 |
| GitHub Actions: lint + tsc + build + tests como gate de merge | 1 |
| Sentry + logging estructurado | 1 |

**Entregable:** las 3 vulnerabilidades críticas cerradas **con una prueba que las verifica**, y CI que impide reintroducirlas.
**Prioridad: máxima. Nada más se construye hasta cerrar esto.**

---

## v0.8.0 — "Confianza" · 3 semanas · Dificultad media-alta · Impacto ALTO

**Objetivo:** que "trabajador verificado" signifique algo, y que el trabajador se entere de que lo contrataron.

| Tarea | Días |
|---|---|
| Back-office de verificación en `/admin` (lista, visor, aprobar/rechazar con motivo) | 4 |
| Trigger que recalcula `profile_stats` al verificarse un documento | 1 |
| Corregir la semántica de "verificado" en `compatibility.ts` y `ApplicantCard` | 1 |
| Edge Function `dispatch-notification` + Resend (email) | 3 |
| Integración WhatsApp Business API para eventos críticos | 4 |
| Preferencias de canal por usuario (UI sobre la tabla existente) | 2 |
| Arreglar el bloqueo de conversaciones (escribir en ambas partes + leerlo en `sendMessage`) | 1 |
| Rate limiting global sobre server actions | 2 |
| Mergear los 5 módulos de la rama en PRs revisables | 2 |

**Entregable:** verificación operativa de punta a punta y contratación notificada fuera de la app.

---

## v0.9.0 — "Escala" · 3 semanas · Dificultad media · Impacto MEDIO-ALTO

**Objetivo:** aguantar tráfico real y cerrar la deuda técnica antes de que se vuelva cara.

| Tarea | Días |
|---|---|
| Resolver el N+1 de `getMessagesUnreadCount` | 1 |
| Migrar `<img>` → `next/image` + `remotePatterns` de Google | 1 |
| Índices `(status, created_at desc)` + `pg_trgm` | 1 |
| Compatibilidad como función SQL con orden en base | 2 |
| ISR en `/jobs` y `/jobs/[id]` | 1 |
| Regenerar tipos con `supabase gen types`; eliminar los casts | 2 |
| Migraciones vía Supabase CLI + entorno de staging | 3 |
| Unificar el detalle de chamba en una ruta | 2 |
| `UNIQUE (job_id, worker_id)` en conversaciones | 1 |
| Onboarding progresivo tras el registro | 3 |
| Playwright sobre los 3 recorridos críticos | 3 |
| Textos legales definitivos (externo) | — |

**Entregable:** rendimiento estable con miles de usuarios y proceso de despliegue reproducible.

---

## v1.0.0 — "Lanzamiento" · 4 semanas · Dificultad alta · Impacto ALTO

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
| Documentar backups y respuesta a incidentes | 1 |

**Entregable:** MVP v1.0 con modelo de ingresos.

---

## Resumen

| Versión | Objetivo | Duración | Dificultad | Impacto | Prioridad |
|---|---|---|---|---|---|
| **v0.7.0** | Blindaje de seguridad + CI | 2 sem | Media | **Crítico** | **1** |
| **v0.8.0** | Confianza y notificaciones | 3 sem | Media-alta | Alto | 2 |
| **v0.9.0** | Rendimiento y deuda técnica | 3 sem | Media | Medio-alto | 3 |
| **v1.0.0** | Pagos y lanzamiento | 4 sem | Alta | Alto | 4 |

**Total: 12 semanas (~3 meses)** a dedicación completa, más los tiempos externos de abogado, proveedor de pagos y auditoría.

---

# 16. Opinión técnica

*Escrito como si fuera el CTO de Chamby, sin complacencia.*

## Lo que este proyecto hace muy bien

Empiezo por ahí porque es real y no quiero que se pierda entre las críticas.

**El criterio de producto es sólido.** Alguien pensó de verdad en el usuario peruano: la hormiguita no es decoración, es una identidad que un albañil de Villa El Salvador va a recordar; el mobile-first es genuino, no una adaptación; los estados vacíos hablan como habla la gente. Ese trabajo no se compra ni se improvisa.

**Hay decisiones de ingeniería de nivel alto.** El presupuesto de 2 canales Realtime por usuario es la clase de restricción que se define cuando alguien ya vio un sistema morir por fan-out de suscripciones. `cache()` sobre `getCurrentUserAndProfile()` para deduplicar entre layout y página. Índices parciales para conteos O(1). Once migraciones sin una sola operación destructiva. Nada de eso es accidental.

**La documentación está por encima de la media de la industria.** Y hay un detalle que dice mucho: el hallazgo P3 de la auditoría era falso, se detectó, y en lugar de borrarlo se documentó el error con su causa raíz ("se revisó el TypeScript sin revisar los triggers") y se convirtió en una regla en `CLAUDE.md`. Esa honestidad es cultura de ingeniería.

## Qué haría diferente

**Habría escrito las pruebas de RLS el día que escribí la primera política.** Este es el error del que se derivan casi todos los demás. RLS es la única barrera de autorización del sistema — con la anon key pública, no hay nada más entre un atacante y la base de datos. Se escribieron políticas para 17 tablas y no se escribió una sola prueba que intentara violarlas. Por eso tres agujeros críticos llevan desde la migración 0001 —**el primer día del proyecto**— y pasaron por una auditoría de calidad que los declaró inexistentes.

**No habría dejado que la auditoría se detuviera en la superficie del código.** `docs/AUDITORIA.md` dice "críticos: 0" y lista como evidencia "RLS activo en todas las tablas con políticas de ownership". Verificó que RLS estuviera **encendido**, no que estuviera **bien delimitado**. Es el mismo error del hallazgo P3 en espejo: entonces se leyó TypeScript sin leer SQL; aquí se leyó SQL sin leerlo columna por columna. Una auditoría que no intenta romper el sistema es un inventario.

**Habría puesto CI en el commit número 3.** Cuesta una hora. Hoy, con 15.000 líneas y cinco módulos sin mergear, cada integración es un acto de fe.

**No habría acumulado cinco módulos en una rama.** El propio repositorio establece "una rama por PR" y los primeros 14 PRs lo cumplieron con disciplina. Luego se abandonó. Esa rama toca 11 migraciones y ~8.000 líneas: nadie la va a revisar de verdad, y ya se sabe que no lo hará. El proceso no se abandona porque deje de ser útil; se abandona porque revisar es lento y construir es divertido. El precio se paga después.

## Los errores que veo

1. **Confundir "RLS habilitado" con "autorización correcta".** El error conceptual raíz. En Postgres, `UPDATE ... USING (auth.uid() = id)` sin `WITH CHECK` por columna significa "el dueño puede cambiar lo que quiera de su fila" — incluida la columna que define sus privilegios. Se escribió esa política pensando en *quién* toca la fila, sin preguntar *qué* puede cambiar de ella.

2. **Construir la fachada de la confianza antes que su mecanismo.** Existe la insignia "Verificado", la tabla de documentos, el bucket privado, el `trust_score`, la subida de DNI y antecedentes. No existe la pantalla que aprueba un documento. Se construyó todo el escenario menos la función que le da sentido. Y mientras tanto la UI dice a los empleadores que hay trabajadores verificados que no lo están.

3. **Usar `is_active` como señal de verificación.** Vale `true` para todos por defecto: 15 de 100 puntos de compatibilidad que no discriminan nada. Aparece en `compatibility.ts` y en `ApplicantCard`. Es mi propio código de esta sesión y es un error: tomé la columna que estaba a mano en lugar de la que significaba lo que necesitaba.

4. **Velocidad de construcción muy por encima de la velocidad de verificación.** Cinco módulos grandes en pocos días, con `npm run build` como único criterio de aceptación. Un build verde solo demuestra que el código compila.

5. **Documentación que envejece sin que nadie la jubile.** El README describe 3 migraciones de 11 y un roadmap que ignora la mitad de lo construido. `NOTIFICACIONES-DISENO.md` especifica tablas (`push_subscriptions`, `notification_dispatches`) que nunca se crearon. Documentación falsa es peor que ninguna: la gente confía en ella.

## Los riesgos que más me preocupan

**El que me quita el sueño no es un bug: es la combinación de verificación falsa y trabajo físico presencial.** Chamby conecta desconocidos para que uno entre a la casa del otro. La aplicación muestra insignias de confianza que no respaldan nada. Si ocurre un incidente serio y sale a la luz que la plataforma exhibía "Verificado" sin verificar a nadie, el daño reputacional y legal supera cualquier problema técnico de esta lista. **Esto no es deuda técnica: es exposición.**

**El segundo es la escalada a admin.** No requiere habilidad: requiere abrir la consola. Cualquier beta tester curioso puede encontrarlo, y borrar la base de datos de un producto sin backups verificados es un evento de extinción.

**El tercero es la deriva de esquema.** Once migraciones aplicadas a mano en el SQL Editor, sin registro de qué se aplicó dónde, sin staging. Nadie en este proyecto puede afirmar con certeza qué esquema corre en producción. El día que un despliegue asuma una migración no aplicada, el fallo será en tiempo de ejecución y ningún build lo habrá anticipado.

## Qué cambiaría antes de lanzar

Sin negociación:

1. Las tres vulnerabilidades críticas, **cada una con la prueba que la verifica**. Sin la prueba, la corrección es temporal.
2. Verificación de identidad real, o **quitar todas las insignias de verificado de la UI**. La opción intermedia no existe: o se verifica o no se afirma.
3. Teléfonos fuera del alcance anónimo.
4. Términos y privacidad reales.
5. CI que impida mergear sin tests.
6. Monitoreo de errores.

Y una decisión de producto que no es técnica: **no abrir al público hasta tener el back-office de verificación**. Es preferible una beta cerrada de 100 personas donde la confianza sea verdad, que 5.000 usuarios donde sea una etiqueta.

## En qué invertiría primero

Si tuviera presupuesto para **una sola cosa**: **un ingeniero senior durante seis semanas dedicado exclusivamente a seguridad y pruebas.** No a funcionalidades. Las tres semanas primeras cerrando los críticos con pruebas de RLS y montando CI; las tres siguientes en pruebas de integración de los triggers de contratación y los recorridos E2E.

**Justificación:** este proyecto no tiene un problema de funcionalidades — tiene más de las que su propio roadmap contemplaba. Tiene un problema de **verificabilidad**. Cada módulo nuevo aumenta la probabilidad de romper uno viejo y nadie lo detectaría. Añadir pagos sobre esta base sería irresponsable: si hoy se puede forjar reputación, mañana se podrá forjar un cobro.

Si tuviera presupuesto para **dos**: lo anterior, más **la integración de WhatsApp**. En Perú, WhatsApp es el canal por defecto. Hoy un empleador contrata y el trabajador se entera cuando abre la app — si la abre. Es la funcionalidad con mayor retorno directo sobre la conversión de todo el backlog, y cuesta cuatro días.

## Veredicto

Chamby está **más cerca de lo que parece y más lejos de lo que cree**.

Más cerca porque lo difícil está hecho: el bucle completo del marketplace funciona, el chat en tiempo real es de buena calidad, la identidad de marca es un activo real, y el código está lo bastante bien organizado como para que corregirlo sea barato.

Más lejos porque el producto se comporta como si estuviera listo para beta pública cuando su capa de autorización tiene tres brechas explotables desde el primer día del proyecto, su promesa central de confianza no está implementada, y no existe una sola prueba automatizada que verifique nada de lo anterior.

**Doce semanas de trabajo disciplinado separan a Chamby de un v1.0 lanzable.** Ninguna de esas doce semanas debería dedicarse a funcionalidades nuevas hasta terminar las dos primeras.

---

*Informe elaborado el 29 de julio de 2026 sobre `claude/chamby-mvp-redesign-glb9uc` @ `ac390e4`.*
