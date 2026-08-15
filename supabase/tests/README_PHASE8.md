# Fase 8 — Validación reproducible de seguridad de Reports

Este directorio contiene la infraestructura de pruebas preparada en la Fase 8
para validar, contra un Postgres/Supabase de **TEST/STAGING real** (nunca
producción), lo que las Fases 1-7 solo pudieron verificar de forma estática o
con mocks. **Nada de esto se ejecutó todavía** — esta sesión no tiene acceso a
ningún Postgres/Supabase real (ver el informe de Fase 7 en el historial de la
conversación). Los tres archivos quedan listos para correr en cuanto ese
acceso exista.

## Archivos

| Archivo | Qué prueba | Cómo correr | Requiere |
|---|---|---|---|
| `reports_security_phase8.sql` | RLS de `reports`/`report_evidence`/`moderation_actions`/`reporter_reports_view`, column grants (Parte I, vía `information_schema`), los 7 escenarios de F6-02 (0025), F6-01 secuencial (conteo/excepción/rollback, NO concurrencia), triggers de notificación (0023), y una confirmación empírica de que la máquina de estados solo se valida server-side (Parte H) | `psql` contra un Postgres 16 desechable — instrucciones completas en el encabezado del archivo | Solo Postgres (createdb local, sin necesidad de un proyecto Supabase) |
| `phase8_concurrency_f6_01.sh` | F6-01 bajo **concurrencia real** (dos conexiones simultáneas intentando la evidencia #5) — lo único que `reports_security_phase8.sql` NO puede demostrar | `PHASE8_DATABASE_URL=... PHASE8_CONFIRM_NOT_PROD=yes ./phase8_concurrency_f6_01.sh` | Postgres con 0001-0025 ya aplicadas y al menos un `profiles` de prueba |
| `phase8_storage_check.mjs` | Parte F: bucket `report-evidence` (`public=false`, MIME types, límite de tamaño), ownership de upload, path traversal, que nadie salvo `service_role` pueda leer/firmar URLs, que el usuario reportado no tenga acceso especial | `PHASE8_SUPABASE_URL=... PHASE8_SUPABASE_SERVICE_ROLE_KEY=... PHASE8_SUPABASE_ANON_KEY=... PHASE8_CONFIRM_NOT_PROD=yes node phase8_storage_check.mjs` | Un proyecto Supabase real (Auth + Storage) — esto es lo único que **no** se puede probar con Postgres puro, porque `storage.objects` RLS depende de un JWT de sesión real, no de `set request.jwt.claim.sub` |

Los tests estáticos y con mocks ya existentes (`fase6-migrations.test.ts`,
`reports.test.ts`, `report-evidence.test.ts`, `admin-reports.test.ts`, etc.) y
los `.test.sql` pgTAP-style previos a esta fase (`0008`, `0009`, `0014`,
`0015`) **no se tocaron** — coexisten con esta suite, no la reemplazan.

## Por qué tres archivos y no uno

- `reports_security_phase8.sql` no necesita Auth/Storage real — el patrón
  `set role authenticated; set request.jwt.claim.sub = '<uuid>'` (ya usado en
  `0008`/`0014`) simula `auth.uid()` sin necesidad de un JWT real, así que
  puede correr contra cualquier Postgres 16 desechable con las migraciones
  aplicadas. No prueba Storage porque `storage.objects` en Supabase real no
  es una tabla que uno inserte directamente desde la app — se llega a ella
  vía la Storage API HTTP, cuyo comportamiento (multipart upload, límites de
  tamaño reales, content-type real) un `INSERT` a `storage.objects` no
  reproduce fielmente.
- `phase8_concurrency_f6_01.sh` necesita DOS conexiones simultáneas reales —
  un único script `psql -f archivo.sql` es inherentemente secuencial, sin
  importar el orden de las sentencias.
- `phase8_storage_check.mjs` necesita un cliente `supabase-js` con sesiones
  de Auth reales — es la única forma honesta de probar `storage.objects` RLS
  tal como la aplicación realmente la usa.

## Qué NO está en esta fase (por diseño, Parte N del prompt maestro)

- Ningún cambio a migraciones existentes ni a `src/lib/actions/*.ts`.
- Ninguna funcionalidad nueva de producto.
- Ningún resultado de ejecución inventado o simulado.

## Si una prueba revela un bug real al correr esto

1. Detente.
2. Documenta: hallazgo, evidencia (salida real del test), impacto, archivo,
   reproducción.
3. Propone una corrección mínima.
4. NO la implementes automáticamente si toca producción o cambia
   arquitectura — space para autorización explícita, mismo protocolo que
   Fases 1-7.

## Hallazgo ya documentado sin necesidad de ejecución (Parte H)

La lectura de `src/lib/actions/admin-reports.ts:282` confirma que
`REPORT_STATUS_TRANSITIONS` se valida **exclusivamente en la Server Action**
(`updateReportStatus()`) — no existe ningún `CHECK`/trigger en Postgres que
impida una transición inválida (p. ej. `resolved → pending`) a nivel de fila.
El bloque `N-STATE-1` en `reports_security_phase8.sql` lo confirma
empíricamente: un `UPDATE` directo con rol `admin` que viola
`REPORT_STATUS_TRANSITIONS` **no encuentra ningún obstáculo en la base de
datos**. Esto es coherente con el patrón ya documentado en `CLAUDE.md`
("RLS restringe QUIÉN, la Server Action debe restringir QUÉ valor"), y no es
una regresión de ninguna fase anterior — pero es una superficie real: un JWT
de admin válido usado directamente contra PostgREST (sin pasar por la app
Next.js) podría reabrir un reporte `resolved`/`dismissed`, algo que el diseño
dice explícitamente que nunca debe ocurrir. Queda documentado como hallazgo
de severidad **baja/media** (requiere ya tener credenciales de admin válidas
— no es una escalada de privilegios, es una falta de defensa en profundidad)
para que una fase futura decida si vale la pena agregar un `CHECK`/trigger
que espeje `REPORT_STATUS_TRANSITIONS` en la base de datos. No se implementa
aquí sin autorización explícita (Parte N).
