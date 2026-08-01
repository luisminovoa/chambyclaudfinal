# Auditoría de seguridad — Sprint v0.8 (cierre de V1)

> Estado: **cerrado y mergeado a `main`** (commit `f93cbc2`, fast-forward desde
> `e8caf5d`). Complementa `docs/SECURITY_AUDIT_v0.7.md` (V2/V3). Corresponde a
> V1 del barrido original (`docs/AUDITORIA.md`).

## 1. Origen: por qué esto no es "mergear PR #15"

PR #15 (`claude/fix-rls-role-escalation-v1v4`) fue revisado completo, no solo
su descripción. Su commit de punta (`9581f37`) sí es exactamente lo descrito
(167 líneas: migración + test sobre `profiles`/`user_roles`), pero **el PR
como unidad de merge** (`base: main` → `head` de esa rama) arrastra 11 commits
adicionales no mencionados en su descripción: 5 commits de funcionalidad de
negocio sin diseño aprobado (sistema multi-rol, perfil profesional
verificado, marketplace de búsqueda de chambas, preselección y contratación
multi-vacante — ~10.460 líneas en 64 archivos) y 6 commits de documentación de
otra iniciativa. Además, la mitad del fix original (`user_roles_update_own`)
depende de una tabla `user_roles` que **no existe en `main`** — la crea
únicamente el feature de multi-rol no aprobado.

Por esto, siguiendo instrucción explícita del propietario del repositorio,
**no se mergeó la rama del PR #15**. Se extrajo y reimplementó, de forma
independiente y autocontenida, únicamente la corrección de
`profiles_update_own` (V1), sin ninguna dependencia de `user_roles`, sistema
multi-rol o `switchRoleAction()`.

## 2. Vulnerabilidad corregida: V1 — escalada directa a `role='admin'`

`profiles_update_own` (`0001_init.sql`) era una policy `UPDATE` con `USING`
pero sin `WITH CHECK`. Postgres reutiliza `USING` sobre la fila resultante
cuando no hay `WITH CHECK`, y `USING` solo exigía `auth.uid() = id`, sin mirar
`role`. Cualquier usuario autenticado podía ejecutar:

```sql
update public.profiles set role = 'admin' where id = auth.uid();
```

y obtener control administrativo total, ya que `current_user_role()` (leída
por casi todas las demás policies admin-gated del esquema) lee `profiles.role`.

**Corrección** (`0009_fix_v1_role_escalation.sql`): se añadió `WITH CHECK` que
exige, para el propio dueño de la fila, `role in ('worker', 'employer')` —
nunca `'admin'` — preservando el bypass total para admins reales
(`current_user_role() = 'admin'`), sin cambios de comportamiento en
`changeUserRole`/`toggleUserActive` (`src/lib/actions/admin.ts`).

**Verificación de que no hay más rutas de escritura sobre `profiles.role`**:
grep exhaustivo de `src/` confirmó que las únicas dos escrituras `.update()`
sobre `profiles` en toda la rama son `toggleUserActive` (`is_active`) y
`changeUserRole` (`role`), ambas detrás de `assertAdmin()`. No existe
`src/app/api/*` (sin API routes), un solo `.rpc()` en todo el código (ajeno a
`profiles`, rate-limit de chat), y no existe `roles.ts` ni `switchRoleAction`
en esta rama — esas piezas solo viven en la rama no aprobada del PR #15.

## 3. Pruebas realizadas

`supabase/tests/0009_fix_v1_role_escalation.test.sql`, ejecutada contra
Postgres 16 real con las 9 migraciones aplicadas en orden:

| Bloque | Escenario | Resultado |
|---|---|---|
| N1 | Worker se autoescala a `role='admin'` | RLS rechaza |
| N2 | Worker modifica el perfil de otro usuario | 0 filas (excluido por `USING`) |
| P1 | Admin real promueve a otro usuario a admin (`changeUserRole`) | Correcto |
| P2 | Admin real suspende/reactiva una cuenta (`toggleUserActive`) | Correcto |
| P3 | Worker alterna su propio `role` worker↔employer (**capacidad de policy verificada por SQL directo, sin Server Action de producción detrás en esta rama** — ver §5) | Correcto (comportamiento de policy, no de una función de la app) |

Se re-ejecutó también la suite de `0008` (V2/V3) sobre las 9 migraciones:
resultado idéntico a la ronda anterior, cero regresión cruzada.

Verificación estática: `tsc --noEmit` limpio · `lint` sin warnings · `build`
27/27 páginas.

## 4. Estado final de las vulnerabilidades

| # | Vulnerabilidad | Estado | Dónde se cerró |
|---|---|---|---|
| V1 | Escalada directa a `role='admin'` en `profiles` | **Cerrada** | `0009_fix_v1_role_escalation.sql` (este sprint) |
| V2 | Autocontratación (`job_applications`) | **Cerrada** | `0007_fix_v2_v3_security.sql` + `0008_harden_v2_v3_rls.sql` |
| V3 | Calificaciones falsas (`ratings`) | **Cerrada** | `0007_fix_v2_v3_security.sql` + `0008_harden_v2_v3_rls.sql` |
| V4 | Escalada vía `user_roles` + `switchRoleAction()` | **Pendiente — no aplicable en `main` actual** | No aplicable hasta que el sistema multi-rol se proponga y apruebe con su propio diseño (`user_roles` no existe hoy en `main`) |

## 5. Riesgos residuales

- **V4 sigue abierta y documentada**, no por negligencia sino porque su
  precondición (tabla `user_roles`, sistema multi-rol) no existe en `main`.
  Debe tratarse como parte de un sprint independiente cuando ese feature se
  proponga formalmente (diseño en `docs/`, aprobación explícita, y entonces
  sí requerirá su propia policy `user_roles_update_own` con `WITH CHECK`
  antes de mergear, replicando el mismo patrón usado aquí).
- **Autorreactivación de `is_active`** por un usuario suspendido por un admin
  sigue sin corregirse: `profiles_update_own` no restringe `is_active` para
  el propio dueño. PR #15 lo resolvía junto con V1 mediante una comparación
  contra el valor anterior de la fila, pero es una regla de negocio adicional
  fuera de la definición original de V1 (`role='admin'`); se dejó fuera de
  alcance deliberadamente (ver prueba `R1` en `0009_fix_v1_role_escalation.test.sql`,
  que confirma explícitamente que este camino sigue abierto). Recomendado
  para el próximo sprint de seguridad.
- **P3 no representa una capacidad ejercida hoy por la aplicación** — es una
  verificación de que la policy no bloquea un futuro `switchRoleAction`
  legítimo (worker↔employer) el día que ese feature se apruebe. Si se
  prefiere una postura más estricta mientras esa función no exista, la
  policy puede endurecerse para bloquear también el cambio worker↔employer
  del propio dueño hasta que exista la Server Action correspondiente — no se
  hizo en este commit para no anticipar una decisión de producto no tomada.
- **Rama remota `claude/fix-v1-role-escalation` no pudo eliminarse**: mismo
  bloqueo de política del proxy de git de este entorno (`HTTP 403` en
  `git push --delete`, confirmado no transitorio). La rama local sí se
  eliminó. Pendiente de borrado manual desde GitHub si se desea.

## 6. Recomendaciones para el siguiente sprint

1. Si se decide avanzar con el sistema multi-rol, requiere diseño aprobado en
   `docs/` **antes** de implementación (política ya establecida en
   `CLAUDE.md`), y su propia migración de RLS para `user_roles` con
   `WITH CHECK` desde el día uno — no reproducir el patrón original que causó
   V1/V4 (policy sin `WITH CHECK`).
2. Evaluar cerrar la autorreactivación de `is_active` como hallazgo propio,
   independiente del multi-rol.
3. Automatizar `supabase/tests/*.test.sql` en CI (recomendación ya registrada
   en `docs/SECURITY_AUDIT_v0.7.md`, sigue pendiente).
