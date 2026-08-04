# Propuesta — Sprint hacia Beta Pública

> Documento de planificación. **Nada de esto está implementado.** Prioriza por
> impacto para poder abrir Chamby a usuarios reales fuera del círculo cercano,
> siguiendo el orden ya establecido para el proyecto:
> **Confiabilidad > Seguridad > Estabilidad > Escalabilidad > Nuevas funcionalidades.**

## Contexto: dónde estamos

- Sprint de Seguridad: V1, V2, V3 cerradas en `main`. V4 (escalada vía `user_roles`)
  documentada como pendiente — **no aplicable hoy**, porque su precondición (tabla
  `user_roles`, sistema multi-rol) no existe en `main`. No bloquea beta pública.
- Módulo de Perfil Profesional (`v0.9.0-beta`) mergeado: fotos, documentos,
  experiencia, habilidades, barra de completitud, insignias de confianza.
- Auditado y con RLS verificado contra Postgres real en cada sprint.

**El hallazgo más importante de este documento:** el módulo que acabamos de construir
tiene un hueco funcional, no de seguridad — lo explico primero porque cambia la
prioridad de todo lo demás.

---

## Prioridad 1 — Confiabilidad: cerrar el loop de verificación

### 1.1 Panel de administración para verificar documentos

**El problema:** `verification_documents` tiene una policy `docs_update_admin` que
permite a un admin cambiar `status` a `verified`/`rejected` — pero **no existe
ninguna página de admin que use esa policy**. Revisé `/admin/jobs`, `/admin/users`,
`/admin/beta`: ninguna lista documentos pendientes de revisión. Esto significa que
la insignia "Identidad verificada" (10% de la barra de completitud, la insignia
más visible del sistema de confianza) es **hoy inalcanzable en la práctica** —
un trabajador puede subir su DNI, pero nadie puede jamás marcarlo como verificado.

**Por qué es prioridad 1:** construimos toda una arquitectura de confianza (badges,
trust_score, RLS específicamente diseñado para que solo un admin pueda verificar)
y el eslabón que la activa no existe. Para una plataforma cuyo diferenciador
declarado es la confianza, lanzar a público sin esto activo es publicar una
promesa vacía — el badge "verificado" nunca aparecerá para nadie.

**Alcance propuesto:**
- `/admin/verifications` — cola de documentos `pending`, agrupados por trabajador,
  con vista previa (imagen/PDF vía `getDocumentDownloadUrl`, ya existe) y botones
  Aprobar/Rechazar.
- Nueva Server Action `adminUpdateDocumentStatus(documentId, status)` en
  `src/lib/actions/admin.ts` (mismo patrón `assertAdmin()` que las demás),
  reutiliza la policy `docs_update_admin` ya existente — **cero migraciones nuevas**.
- Notificación al trabajador cuando su documento cambia de estado (la tabla
  `notifications` y el trigger pattern ya existen, ver `0004_notifications.sql`).

**Esfuerzo estimado:** bajo-medio. Una página, una Server Action, una notificación.
Ningún cambio de esquema.

**Decisión de producto que requiere tu confirmación:** ¿quién revisa documentos en
la práctica? Si es manual (tú u otra persona), esto es suficiente. Si esperas
volumen alto, eventualmente necesitará un proveedor de verificación de identidad
externo (RENIEC API, etc.) — **fuera de alcance de este sprint**, lo señalo para
que quede en el radar.

### 1.2 QA responsive/accesibilidad del módulo de Perfil Profesional

El barrido de 36/36 rutas×viewport documentado en `docs/AUDITORIA.md` es anterior
a este módulo — nunca se verificó visualmente `/dashboard/worker/profile` en los
6 viewports. Antes de tráfico público, correr el mismo barrido sobre las 5
pestañas nuevas. Esfuerzo bajo (ya existe la metodología, solo falta ejecutarla).

---

## Prioridad 2 — Seguridad: cerrar lo que ya se identificó y no se ha tocado

### 2.1 Automatizar `supabase/tests/*.test.sql` en CI

Recomendación repetida en `docs/SECURITY_AUDIT_v0.7.md` y `v0.8.md`, todavía
pendiente. Hoy, cada vez que se toca RLS, la verificación es manual (levantar
Postgres desechable, aplicar migraciones, correr el `.test.sql`) — funciona
porque lo hemos hecho disciplinadamente en cada sprint, pero es exactamente el
tipo de paso que se salta bajo presión de tiempo, y es donde V1-V4 y los 2
hallazgos de `profile_photos`/`profile_stats` se originaron: nadie corrió esa
verificación al escribir la migración original.

**Alcance propuesto:** GitHub Action que, en cada PR que toque
`supabase/migrations/**`, levante Postgres 16 en el runner, aplique las
migraciones en orden, corra todos los `.test.sql` existentes, y falle el check
si algún bloque negativo no es rechazado. Es la misma secuencia de comandos que
ya usamos manualmente — solo hay que scriptearla.

**Por qué prioridad 2 y no 1:** no cierra una vulnerabilidad existente, previene
las futuras. Alto valor, pero el trabajo de "confiabilidad visible al usuario"
(1.1) tiene más impacto inmediato para el lanzamiento.

**Esfuerzo estimado:** medio (la parte scripteable ya existe en los comentarios
de cada `.test.sql`; falta el workflow YAML y decidir qué runner de Postgres usar).

### 2.2 V4 — revisar cuando (si) el sistema multi-rol se retome

No es una tarea de este sprint. Lo dejo aquí solo para que quede explícito en la
priorización: **no bloquea beta pública**, porque su precondición no existe en
`main`. Si en algún momento se decide construir multi-rol, su propia migración de
`user_roles` debe nacer con `WITH CHECK` desde el día uno — no repetir el patrón
original.

---

## Prioridad 3 — Estabilidad

### 3.1 Observabilidad básica (error tracking + uptime)

No encontré ningún sistema de captura de errores en producción más allá de
`ReportErrorButton` (que depende de que el usuario decida reportar manualmente).
Para tráfico público, un error de servidor silencioso (p. ej. un 500 en un Server
Action) hoy no genera ninguna alerta — solo se sabría si un usuario lo reporta a
mano. Recomiendo evaluar una integración ligera (Sentry u equivalente) acotada a
capturar excepciones no manejadas en Server Actions y Server Components.

**Decisión de producto/costo:** herramientas de este tipo suelen tener un tier
gratuito suficiente para el volumen de una beta, pero implica una cuenta externa
nueva — te lo consulto antes de elegir proveedor.

### 3.2 Notificaciones por email

`docs/CHANGELOG.md` (v0.6.0) ya documenta que el modelo de datos de
`notifications` está preparado para email/push/SMS/WhatsApp sin cambios de
esquema, pero ningún canal externo está conectado — todo es in-app. Para
usuarios que no tienen la pestaña de Chamby abierta (el caso normal fuera del
círculo cercano de beta privada), un evento crítico como "te aceptaron para un
trabajo" o "tienes un mensaje nuevo" hoy no llega a nadie que no esté mirando la
app en ese momento.

**Alcance propuesto (mínimo viable):** integrar un proveedor de email
transaccional (Resend, ya lo tenías en mente según conversaciones previas) para
2-3 eventos de mayor impacto: aplicación aceptada, nuevo mensaje, nueva
calificación. No es necesario cubrir los 10 tipos de `NotificationType` de una vez.

**Esfuerzo estimado:** medio — requiere cuenta de proveedor, verificación de
dominio de envío, y una función que traduzca `notifications` insertadas a envíos
de email (podría ser un trigger adicional o un cron ligero).

### 3.3 Límite de cantidad en `verification_documents`

Deuda técnica ya señalada en la auditoría del módulo de perfil: fotos tienen
tope de 10, documentos no tienen tope. Bajo riesgo, bajo esfuerzo — un chequeo de
`count` igual al que ya existe en `createPhotoUploadUrl`. Se puede resolver en
una sola línea de código cuando se toque ese archivo por otra razón; no amerita
un sprint propio.

---

## Prioridad 4 — Escalabilidad

Nada urgente identificado. El volumen esperado de una beta pública temprana no
justifica trabajo de escalabilidad todavía — coincide con la guía de los
inversionistas ya registrada en el contexto del proyecto: validar mercado antes
que optimizar para una escala que aún no existe.

---

## Preguntas abiertas que necesito que resuelvas (no técnicas, de producto)

Estas no las puedo decidir por ti — las señalo para que el siguiente sprint
tenga alcance claro desde el inicio, en vez de descubrirlas a mitad de camino:

1. **¿Beta privada ya se lanzó?** El roadmap original definía Sprint 3 = Beta
   Privada (familiares/amigos) antes de crecer. No tengo confirmación de si ya
   ocurrió. Si no, probablemente debería ir antes que cualquier ítem de este
   documento — este plan asume que ya estás mirando hacia audiencia pública.
2. **¿Pagos?** En ninguna parte del proyecto (esquema, Server Actions, docs)
   encontré manejo de pagos o comisión — parece un modelo donde Chamby conecta
   pero el pago es fuera de plataforma (efectivo, típico en trabajo informal en
   Perú). Si eso es intencional, no hace falta nada. Si se esperaba algún tipo de
   cobro antes de beta pública, es una conversación de producto completa, no
   una tarea técnica menor.
3. **Verificación de documentos: ¿manual o vía proveedor externo?** Ver 1.1.

---

## Resumen priorizado

| # | Ítem | Prioridad | Esfuerzo | Bloquea beta pública |
|---|---|---|---|---|
| 1.1 | Panel admin de verificación de documentos | Confiabilidad | Bajo-medio | **Sí** — el sistema de confianza no funciona sin esto |
| 1.2 | QA responsive del módulo de perfil | Confiabilidad | Bajo | Recomendado |
| 2.1 | Automatizar tests RLS en CI | Seguridad | Medio | No, pero reduce riesgo de regresión |
| 2.2 | V4 (multi-rol) | Seguridad | — | No, no aplicable hoy |
| 3.1 | Error tracking | Estabilidad | Bajo-medio | Recomendado |
| 3.2 | Notificaciones por email | Estabilidad | Medio | Recomendado para retención |
| 3.3 | Límite en verification_documents | Estabilidad | Muy bajo | No |
| 4 | Escalabilidad | — | — | No, prematuro |

**Recomendación de orden de ejecución:** 1.1 primero (es lo único que realmente
bloquea que la promesa central del producto funcione), luego 2.1 en paralelo si
hay ancho de banda (previene que el próximo sprint reintroduzca el mismo tipo de
bug), y 3.1/3.2 antes de abrir tráfico verdaderamente público (no antes de una
beta todavía acotada).

No he implementado nada de lo anterior. Queda a la espera de tu aprobación de
alcance antes de empezar cualquier fase.
