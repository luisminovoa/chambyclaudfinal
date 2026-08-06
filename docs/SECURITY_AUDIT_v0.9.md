# Auditoría de seguridad — Sprint v0.9 (Sistema Multi-Rol)

> Estado: **cerrado, pendiente de merge a `main`**. Complementa
> `docs/SECURITY_AUDIT_v0.7.md` (V2/V3) y `docs/SECURITY_AUDIT_v0.8.md` (V1, V4
> documentada como no aplicable). Corresponde al diseño aprobado en
> `docs/DISENO-MULTI-ROL.md`.

## 1. Origen

Se propuso permitir que un usuario posea los roles `worker` y `employer`
simultáneamente (botón "+ Publicar Chamba" en el Navbar, sin pasar por el
perfil para cambiar de modo). El schema real (`profiles.role`, enum escalar
único) no soporta eso — se rechazó implementar solo la navegación y se exigió
primero un documento de diseño (`docs/DISENO-MULTI-ROL.md`, aprobado
2026-08-05), siguiendo la política ya establecida en `CLAUDE.md` para
cambios de lógica de negocio.

El diseño se basó explícitamente en el intento anterior no mergeado (PR #15,
rama `claude/fix-rls-role-escalation-v1v4`, commit `fa5b0c9`) — mismo
motivo por el que V4 quedó documentada como "no aplicable" en
`SECURITY_AUDIT_v0.8.md`: su precondición (`user_roles`) no existía en
`main`. Este sprint la crea, y por lo tanto V4 pasa a ser aplicable y se
cierra en la misma migración que introduce la tabla.

Implementación en 4 fases (`0014_multi_role.sql`, `src/lib/actions/roles.ts`,
`getCurrentUserAndProfile()`, UI de Navbar/BottomNav/UserMenu), cada una
verificada con `tsc`/`lint`/`build` antes de avanzar, seguida de una
auditoría técnica final antes de aprobar el merge — mismo patrón que el
módulo de Perfil Profesional (`SECURITY_AUDIT` implícita en
`0013_harden_profile_module_rls.sql`, ver `CHANGELOG.md` v0.9.0-beta).

## 2. Vulnerabilidades corregidas

### V4 — Escalada vía `user_roles` (cerrada, ya no "no aplicable")

El intento anterior (PR #15) tenía `user_roles_update_own` con `USING` pero
sin `WITH CHECK` — mismo patrón que V1: un usuario podía reescribir su
propio `role` a `'admin'` en `user_roles`. Cerrada desde el primer commit de
`0014` con doble candado:
- `WITH CHECK` explícito en `INSERT`/`UPDATE` — `role in ('worker','employer')`,
  nunca `'admin'`.
- `REVOKE UPDATE` completo + `GRANT UPDATE (active)` únicamente — mismo
  patrón de columna que `0013_harden_profile_module_rls.sql`. Aunque la
  policy fallara, `role`/`user_id` siguen siendo físicamente no escribibles
  vía `UPDATE`.

### V5 — Escalada a `admin` vía metadata de `signUp()` directo (nueva, hallada en la auditoría pre-merge)

**Preexistente desde `0001_init.sql`/`0006_auth_hardening.sql` — no
introducida por este sprint.** `handle_new_user()` hacía
`(raw_user_meta_data->>'role')::user_role` sin ninguna validación. La anon
key de Supabase es pública por diseño; cualquiera puede llamar directamente
a `POST /auth/v1/signup` con `data: { role: "admin" }`, sin pasar por
`register()` (`src/lib/actions/auth.ts`) ni su validación Zod
(`role: z.enum(["worker","employer"])`). Como el trigger es
`security definer`, bypasea RLS por completo — confirmado en vivo insertando
directamente en `auth.users` con ese metadata: produjo
`profiles.role = 'admin'` sin ningún rechazo.

Nunca se había documentado en `SECURITY_AUDIT_v0.7`/`v0.8` (esos cubrieron
escalada vía `UPDATE`, no vía metadata de signup). Se encontró y cerró en
este sprint porque `0014` ya tenía que tocar `handle_new_user()` de todos
modos (para insertar también en `user_roles`) — se aprovechó el mismo
`create or replace function` para cerrarla ahí mismo en vez de abrir una
migración aparte.

**Corrección:** el metadata ya no se castea directamente al enum. Solo un
valor literal `"employer"` produce `role = 'employer'`; cualquier otro valor
(incluido `"admin"`, ausente, o texto arbitrario) colapsa a `'worker'`. No
existe ningún input de signup que pueda producir `'admin'`.

### Hallazgo adicional — cero roles activos (no es escalada, es integridad/disponibilidad)

El candado de columna de V4 (`GRANT UPDATE (active)`) es correcto para su
propósito (impedir escribir `role`/`user_id`), pero no impedía que un
usuario desactivara **todos** sus roles a la vez, dejándolo sin ninguno
activo — `switchRoleAction()` ya no encontraría ninguna fila que activar,
bloqueando al usuario sin forma de recuperar acceso por su cuenta. No hay
ninguna Server Action en producción que exponga esto hoy (no se implementó
ningún `disableEmployerRole()`), pero el `GRANT` ya lo permite a nivel de
base de datos — confirmado en vivo con una llamada directa a la API.

**Corrección:** `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` en
`user_roles` (no un trigger `FOR EACH ROW` inmediato: un `UPDATE` que
desactiva varias filas del mismo usuario en un solo statement necesita
evaluarse contra el estado *final* de la transacción, no la primera fila
tocada, o un caso así pasaría el guard por accidente). Rechaza cualquier
`UPDATE`/`DELETE` que deje a un usuario sin ningún rol activo — cubre tanto
auto-servicio como `DELETE` por admin. Se excluye explícitamente cuando el
`profiles` del usuario ya no existe, para no bloquear el cascade legítimo de
borrado de cuenta (`profiles.id references auth.users(id) on delete
cascade`).

## 3. Pruebas realizadas

Contra Postgres 16 real, con `0001`-`0014` aplicadas en orden
(`supabase/tests/0014_multi_role.test.sql`, 12 bloques):

| Bloque | Escenario | Resultado |
|---|---|---|
| N1 | Reescribir `role` propio a `'admin'` vía `UPDATE` | Rechazado (columna sin `GRANT`) |
| N2 | Insertar `role='admin'` directo | Rechazado (`WITH CHECK`) |
| N3 | Insertar/actualizar fila de OTRO `user_id` | Rechazado |
| N4 | Signup con `raw_user_meta_data.role = 'admin'` (V5) | `profiles`/`user_roles` quedan en `'worker'` |
| N5 | Desactivar TODOS los roles en un solo `UPDATE` multi-fila | Rechazado — el `UPDATE` completo se revierte |
| N6 | Admin borra la última fila activa de otro usuario | Rechazado |
| P1 | Agregar `employer` conservando `worker` | Aceptado |
| P2 | Usuario queda con ambos roles activos | Confirmado, ninguno se pierde |
| P3 | Desactivar SOLO uno de dos roles (conservando el otro activo) | Aceptado |
| P4 | Admin borra una fila que NO es la última activa | Aceptado |
| P5 | Cascade de borrado de cuenta completa (`auth.users`→`profiles`→`user_roles`) | No bloqueado por el guard de rol activo |
| — | Reintento de `enableEmployerRole()` con dos INSERT concurrentes (condición de carrera) | Constraint `unique(user_id,role)` previene duplicados; sin corrupción |

Re-ejecución de `0008_harden_v2_v3_rls.test.sql` y
`0009_fix_v1_role_escalation.test.sql`: mismo resultado que su baseline
documentado, cero regresión cruzada.

Verificación estática: `tsc --noEmit` limpio · `lint` sin warnings · `build`
28/28 rutas.

## 4. Estado final de las vulnerabilidades

| # | Vulnerabilidad | Estado | Dónde se cerró |
|---|---|---|---|
| V1 | Escalada directa a `role='admin'` en `profiles` | Cerrada (sprint anterior) | `0009_fix_v1_role_escalation.sql` |
| V2 | Autocontratación (`job_applications`) | Cerrada (sprint anterior) | `0007`/`0008` |
| V3 | Calificaciones falsas (`ratings`) | Cerrada (sprint anterior) | `0007`/`0008` |
| V4 | Escalada vía `user_roles` | **Cerrada** | `0014_multi_role.sql` (este sprint) |
| V5 | Escalada a `admin` vía metadata de `signUp()` directo | **Cerrada** | `0014_multi_role.sql` (este sprint; preexistente desde `0001`/`0006`) |
| — | Cero roles activos (integridad/disponibilidad, no escalada) | **Cerrada** | `0014_multi_role.sql`, `CONSTRAINT TRIGGER` |

## 5. Riesgos residuales

Hallazgos de prioridad Media/Baja de la auditoría técnica, documentados y
dejados fuera de este sprint por instrucción explícita (no bloquean el
merge):

- **Mensajes de error genéricos en `src/lib/actions/roles.ts`** — no usa el
  patrón `formatSupabaseError`/`formatUnknownError` (`src/lib/
  format-supabase-error.ts`) introducido para `profile.ts` en un sprint
  anterior. Un fallo real de RLS/columna en el flujo de roles hoy muestra un
  mensaje genérico, no el error real de Postgres.
- **`getCurrentUserAndProfile()` hace una query extra a `user_roles` en
  10 de 13 call sites que nunca la usan** (`dashboard/page.tsx`,
  `admin/layout.tsx`, `jobs/[id]/page.tsx`, `messages/page.tsx`, etc.) —
  deduplicada por `cache()` dentro del mismo request, pero el costo por
  request subió en todo el sitio.
- **Código muerto**: `getActiveRole()`, `hasRole()` (`roles.ts`) y la
  función SQL `user_has_role()` están definidas pero ningún caller las usa
  todavía.
- **Índice redundante**: `idx_user_roles_user (user_id)` es subsumido por el
  índice único `(user_id, role)` — mantenimiento extra en cada escritura sin
  beneficio de lectura.
- **Edge case de despliegue** (ventana muy estrecha): un signup que ocurre
  exactamente durante el commit de `0014` en producción podría, en teoría,
  crear un `profiles` sin fila correspondiente en `user_roles`. Mitigable
  desplegando en ventana de bajo tráfico.
- **"Configuración" ausente del menú de usuario** pese a estar en el pedido
  original de navegación — no existe `/dashboard/settings` en el proyecto;
  crearla es una funcionalidad nueva, explícitamente fuera de alcance de
  `docs/DISENO-MULTI-ROL.md` §6.
- **Responsive de tablet no verificado en viewport real** — el botón
  "Publicar Chamba" usa `hidden md:inline` (mismo patrón que el resto del
  Navbar) pero no se confirmó visualmente en un dispositivo tablet.

## 6. Recomendaciones para el siguiente sprint

1. Aplicar `formatSupabaseError`/`formatUnknownError` a `roles.ts` — mismo
   trabajo ya hecho en `profile.ts`, consistencia de mensajes en toda la app.
2. Eliminar `idx_user_roles_user` (redundante) o justificar por qué se
   mantiene si se detecta un patrón de acceso que sí lo necesite.
3. Eliminar o cablear `getActiveRole()`/`hasRole()`/`user_has_role()` —
   decidir si tienen un caller previsto a corto plazo o remover el código
   muerto.
4. Evaluar una versión "liviana" de `getCurrentUserAndProfile()` (o carga
   perezosa de `userRoles`) para los call sites que no lo usan.
5. Automatizar `supabase/tests/*.test.sql` en CI — recomendación repetida
   desde `SECURITY_AUDIT_v0.7.md`, sigue pendiente; este sprint volvió a
   depender enteramente de ejecución manual contra Postgres desechable.
