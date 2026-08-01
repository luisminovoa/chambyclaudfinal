# Auditoría de seguridad — Sprint v0.7 (cierre)

> Estado: **cerrado y mergeado a `main`** (commit `c1eab3e`, fast-forward desde
> `bc03549`). Corresponde a V2 y V3 del barrido original (`docs/AUDITORIA.md`).
> V1 y V4 se corrigieron por separado (rama `claude/fix-rls-role-escalation-v1v4`,
> PR #15, fuera del alcance de este documento).

## 1. Vulnerabilidades encontradas

### V2 — Autocontratación (`job_applications`)

Dos rutas independientes permitían que la relación empleador↔trabajador de un
job se estableciera sin una decisión real del empleador:

| # | Ruta | Causa raíz |
|---|------|------------|
| V2-a | `INSERT` en `job_applications` con `worker_id = employer_id` del propio job | `applications_insert_worker` validaba rol y `worker_id`, pero nunca comparaba contra `jobs.employer_id` |
| V2-b | `UPDATE` de la propia postulación `pendiente → aceptado` sin acción del empleador (autoaceptación) | `applications_update` no tenía `WITH CHECK`; el trigger `handle_application_accepted()` no valida quién ejecuta el `UPDATE` |
| V2-c | `UPDATE` de `worker_id` de una postulación ajena hacia el propio empleador (secuestro de postulación) | Misma ausencia de `WITH CHECK`; sin restricción de columnas, `worker_id` era reescribible por cualquiera con permiso de `UPDATE` sobre la fila |

V2-b y V2-c se descubrieron en la revisión de seguridad del PR original (no en
el barrido inicial), al modelar explícitamente un atacante con acceso directo
a `supabase.from(...).update(...)` desde el cliente.

### V3 — Calificaciones falsas (`ratings`)

| # | Ruta | Causa raíz |
|---|------|------------|
| V3-a | `INSERT` en `ratings` con `rated_id` apuntando a un perfil arbitrario, sin verificar que fuera la contraparte real del job | `ratings_insert_participant` validaba que el *rater* fuera participante del job, pero nunca el *rated* |
| V3-b | `INSERT` en `ratings` sobre un job no `completado` | La misma policy no exigía `jobs.status = 'completado'` (regla R4/R9 documentada en `docs/FLUJO-CONTRATACION.md` pero no implementada) |
| V3-c | `UPDATE` directo de `jobs.assigned_worker_id` + `jobs.status='completado'` para fabricar una "relación completada" con cualquier perfil, sin postulación ni aceptación real | `jobs_update_owner_or_admin` no tenía `WITH CHECK` ni restricción de columnas — el empleador podía escribir esas columnas directamente |

V3-c también se descubrió en la revisión de seguridad, no en el barrido
inicial: invalidaba la garantía de V3-a/V3-b porque esas dos policies confían
en `jobs.status`/`jobs.assigned_worker_id` como fuente de verdad, y V3-c
permitía forjar ambas.

## 2. Vulnerabilidades corregidas

Dos migraciones, aplicadas en este orden:

**`0007_fix_v2_v3_security.sql`** — cierra V2-a y V3-a/V3-b (camino de INSERT):
- `applications_insert_worker`: añade `auth.uid() <> (select employer_id from jobs where jobs.id = job_id)`.
- `ratings_insert_participant`: exige `jobs.status = 'completado'` y que `rated_id` sea exactamente la contraparte (`employer_id` ↔ `assigned_worker_id`) según quién sea el `rater_id`.
- `applyToJob`/`submitRating` (Server Actions): mismas validaciones antes del insert, para un error legible en vez de depender solo del rechazo silencioso de RLS.

**`0008_harden_v2_v3_rls.sql`** — cierra V2-b, V2-c y V3-c (camino de UPDATE):
- Privilegios de columna (`REVOKE UPDATE` + `GRANT UPDATE (columnas permitidas)`) que hacen `job_id`/`worker_id` (en `job_applications`) y `assigned_worker_id`/`hired_at`/`employer_id` (en `jobs`) físicamente no escribibles por el rol `authenticated`. Solo el trigger `handle_application_accepted()` (dueño de la tabla, `security definer`) puede tocarlas — sin cambios en su comportamiento.
- `applications_update`: `WITH CHECK` que ata cada transición de `status` al rol correcto (empleador: `pendiente→aceptado/rechazado`; worker: `pendiente→retirado`).
- `jobs_update_owner_or_admin`: `WITH CHECK` que ata `status` a las transiciones realmente usadas por la app (`abierto|en_progreso→cancelado`, `en_progreso→completado`), con bypass total para `admin` (moderación libre, sin cambios respecto al comportamiento previo).
- `updateJobStatus`/`updateApplicationStatus` (Server Actions): antes no verificaban identidad ni ownership en absoluto (dependían 100% de RLS); ahora validan usuario, ownership y transición permitida antes de mutar.

## 3. Metodología utilizada

1. **Lectura de esquema, no solo de TypeScript** — cada hallazgo se verificó contra `supabase/migrations/0001_init.sql` y las migraciones posteriores, no contra el código de Server Actions únicamente (siguiendo la advertencia ya documentada en `CLAUDE.md`/`docs/AUDITORIA.md` sobre no inferir reglas de negocio solo desde TS).
2. **Modelo de atacante explícito**: cliente autenticado con acceso directo a `supabase.from(...).insert/update/delete(...)` desde la consola del navegador, sin pasar por los Server Actions — no solo "¿la UI lo permite?" sino "¿qué permite Postgres/RLS/privilegios de columna?".
3. **Revisión adversarial dedicada** (dos rondas): primera ronda confirmó y cerró el camino de `INSERT`; segunda ronda, actuando explícitamente como *Security Lead* con instrucción de no dar nada por bueno, encontró los tres bypasses de `UPDATE` (V2-b, V2-c, V3-c) que la primera ronda no cubría.
4. **Grep exhaustivo de todo `src/`** para cada tabla afectada (`from("jobs")`, `from("job_applications")`) antes de restringir privilegios de columna, para garantizar cero regresión — no se asumió qué columnas necesitaba cada Server Action, se verificó una por una.
5. **Verificación empírica, no solo razonamiento sobre el papel**: todas las pruebas SQL se ejecutaron contra un Postgres 16 real y desechable (mismo método que PR #15), con las migraciones reales del repo aplicadas en orden.

## 4. Pruebas realizadas

`supabase/tests/0008_harden_v2_v3_rls.test.sql`, ejecutada dos veces (antes y
después del merge) contra un Postgres 16 desechable, con un `GRANT ALL`
intermedio que reproduce el estado por defecto de un proyecto Supabase
existente antes de aplicar `0008` (para verificar que el `REVOKE` de columna
gana sobre esos privilegios amplios):

| Bloque | Escenario | Resultado |
|---|---|---|
| N1 | Worker se autoacepta (V2-b) | RLS rechaza |
| N2 | Empleador reescribe `worker_id` de una postulación ajena (V2-c) | Privilegio de columna rechaza |
| N3 | Empleador fabrica `assigned_worker_id` + `completado` (V3-c) | Privilegio de columna rechaza |
| N3b | Rating sobre la relación fabricada (control de que V3-a/V3-b siguen sosteniendo la garantía) | RLS rechaza |
| N4 | Tercero ajeno intenta tocar una postulación que no es suya | 0 filas afectadas (excluido por `USING`) |
| N5 | Empleador reescribe `hired_at` directamente | Privilegio de columna rechaza |
| P1-P5 | Ciclo legítimo completo: postular → aceptar (trigger asigna worker + `en_progreso`) → completar → calificación mutua real | Los 5 pasos correctos |
| P6 | Empleador cancela un job `abierto` | Correcto |
| P7 | Empleador cancela un job `en_progreso` con worker real asignado | Correcto |
| P8 | Admin conserva override libre de `status` (moderación) | Correcto |

Verificación estática, ejecutada antes y después del merge:
`npx tsc --noEmit` limpio · `npm run lint` sin warnings · `npm run build`
27/27 páginas generadas.

## 5. Riesgos residuales

- **`jobs_update_owner_or_admin` permite técnicamente `abierto → completado` directo** (saltando `en_progreso`) para el empleador, porque RLS no puede exigir el par exacto (origen, destino) sin un trigger adicional — solo restringe "orígenes válidos" y "destinos válidos" de forma independiente. Verificado explícitamente (prueba N3b) que esto **no** es explotable para V3: un job que nunca pasó por `en_progreso` tiene `assigned_worker_id` NULL e inmutable, y `rated_id` no puede ser NULL. Es un gap de integridad de datos, no de seguridad; se dejó fuera de alcance deliberadamente para no ampliar el sprint más allá de V2/V3.
- **V1 (escalada a `admin`) no está en `main`** — vive en la rama `claude/fix-rls-role-escalation-v1v4` (PR #15), aún sin mergear. Mientras un atacante pueda autopromoverse a `admin` (`profiles_update_own` sin `WITH CHECK` en el estado actual de `main`), amplifica el alcance de cualquier policy con bypass `current_user_role() = 'admin'`, incluidas las dos tocadas en este sprint (`applications_update`, `jobs_update_owner_or_admin`). Este sprint no depende de que V1 esté cerrada para ser correcto (el bypass de admin ya existía y no lo introduce ni lo agrava), pero el impacto de V1 sigue siendo crítico y su corrección debería priorizarse.
- **Privilegios de columna dependen de que futuras Server Actions los conozcan**: si se agrega una función legítima que necesite escribir `assigned_worker_id`/`hired_at`/`employer_id` (jobs) o `job_id`/`worker_id` (job_applications) directamente desde `authenticated`, fallará con `permission denied` hasta que se le otorgue el `GRANT` explícito. Es el comportamiento deseado (fail-closed), pero debe quedar documentado para no leerse como un bug.
- **Rama remota `claude/chamby-security-vulnerabilities-sz45tr` no pudo eliminarse**: el proxy de git de este entorno rechazó el `push --delete` con `HTTP 403` (bloqueo de política, no error transitorio — confirmado con un segundo intento). La rama local sí se eliminó. Queda como tarea manual borrarla desde la UI de GitHub si se desea.

## 6. Recomendaciones para el siguiente sprint de seguridad

1. **Mergear PR #15 (V1/V4)** — es el hallazgo crítico más antiguo aún abierto en `main` y amplifica el radio de cualquier policy con bypass de admin.
2. **Auditar `assignments_update_participant`, `stats_update_own`, `history_insert_participant`, `conversations_insert_employer`** — mencionados como pendientes de severidad alta/media en el PR #15 original; no se tocaron en este sprint (fuera de alcance de V2/V3).
3. **Aplicar el mismo patrón de "privilegio de columna + `WITH CHECK` por rol"** a cualquier otra tabla con columnas controladas por trigger que hoy solo dependan de `USING`/`WITH CHECK` sin restricción de columna — es más robusto que una policy sola porque no depende de poder correlacionar fila vieja/nueva.
4. **Evaluar si vale la pena cerrar el gap residual de `abierto → completado`** documentado arriba (trigger `BEFORE UPDATE` con `pg_trigger_depth()` para permitir el bypass legítimo del trigger interno) — no es urgente, pero mejora la integridad del state machine documentado en `docs/FLUJO-CONTRATACION.md`.
5. **Considerar automatizar la ejecución de `supabase/tests/*.test.sql`** en CI (hoy es manual, contra un Postgres desechable) para que estas regresiones no dependan de que alguien las corra a mano en cada cambio de RLS futuro.
