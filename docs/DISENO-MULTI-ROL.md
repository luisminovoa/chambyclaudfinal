# Chamby — Sistema Multi-Rol (Worker + Employer simultáneo)
## Documento de Diseño v1.0

**Estado:** APROBADO — implementado (Fases 1-4 completas + auditoría técnica final
cerrada). Ver `docs/SECURITY_AUDIT_v0.9.md` para el detalle de la auditoría pre-merge
y los hallazgos corregidos. Pendiente únicamente del merge a `main`.
**Autor:** Claude Code
**Fecha:** 2026-08-05
**Prerequisito de:** mejora de navegación "+ Publicar Chamba" (pedida en la
misma conversación que originó este documento) — esa mejora depende de que
esto exista primero.

> **Nota post-implementación:** dos desviaciones respecto al diseño original, ambas
> encontradas en la auditoría técnica final y cerradas antes del merge — no estaban
> previstas aquí porque no eran visibles hasta implementar: (1) `handle_new_user()`
> tenía una vulnerabilidad preexistente (desde `0001`/`0006`, no introducida por este
> diseño) de escalada a `admin` vía metadata de `signUp()` directo, cerrada en la misma
> migración `0014` ya que esta tocaba esa función de todos modos; (2) se agregó un
> `CONSTRAINT TRIGGER` en `user_roles` para garantizar al menos un rol activo por
> usuario — no estaba en el diseño original, necesario porque el candado de columna de
> §4.3 (`GRANT UPDATE (active)`), tal como se diseñó, no impedía desactivar *todos* los
> roles de un usuario a la vez.

---

## 1. Por qué este documento existe

Se pidió una mejora de navegación ("+ Publicar Chamba" en el Navbar, menú de
usuario con "Panel Trabajador" / "Panel Empleador") bajo la premisa de que un
usuario ya puede tener ambos roles simultáneamente y que el cambio sería
"solo navegación, sin tocar RLS ni autenticación".

Investigué el schema actual y **esa premisa es falsa en `main`**:
`profiles.role` es un enum escalar único (`worker` | `employer` | `admin`,
`0001_init.sql:12,41`) — no hay tabla `user_roles`, ni columna array, ni
ningún mecanismo para que una fila represente más de un rol. El propio repo
lo documenta explícitamente en `0009_fix_v1_role_escalation.sql:18-20`: *"no
se toca (...) `user_roles` (...) — ese sistema no existe en esta rama"*, y
`docs/SECURITY_AUDIT_v0.8.md` (§1, §5) registra que un PR anterior (#15,
rama `claude/fix-rls-role-escalation-v1v4`) sí construyó un sistema
multi-rol completo, pero **no se mergeó** — se mergeó únicamente su fix de
seguridad aislado (V1), sin ninguna de sus 5 features de negocio, por
instrucción explícita del propietario del repositorio, dado que llegaba sin
diseño aprobado.

Por eso, antes de tocar cualquier componente de navegación, corresponde
proponer el sistema multi-rol como lo que es: un cambio de arquitectura de
datos y autorización, sujeto a la misma regla que ya está en `CLAUDE.md`
("Business-logic or UX changes... get proposed as a design doc in `docs/`
and approved before implementation").

### 1.1 Punto de partida: el PR #15 rechazado

El commit `fa5b0c9` de esa rama (nunca mergeado, pero inspeccionable en el
historial de git) implementó exactamente este feature con una arquitectura
sólida — **la reutilizo como base de este diseño** porque el enfoque general
es correcto. Pero contenía una vulnerabilidad de la misma familia que V1 (la
razón por la que el PR se descartó como unidad, más allá de arrastrar
features sin aprobar): la policy `user_roles_update_own` tenía `USING` sin
`WITH CHECK`:

```sql
-- fa5b0c9:supabase/migrations/0008_multi_role.sql — VULNERABLE, no reutilizar tal cual
create policy "user_roles_update_own"
  on public.user_roles for update
  using (auth.uid() = user_id);
```

Sin `WITH CHECK`, Postgres reutiliza `USING` sobre la fila resultante. La
policy de `INSERT` sí restringía `role in ('worker','employer')`, pero la de
`UPDATE` no restringía nada sobre la fila final — un usuario autenticado
podía ejecutar:

```sql
update public.user_roles set role = 'admin' where user_id = auth.uid();
```

y, si cualquier lectura de autorización llegara a consultar `user_roles` en
vez de (o además de) `profiles.role`, esto habría sido una escalada de
privilegios — el mismo patrón exacto que V1. Es la vulnerabilidad V4 que
`docs/SECURITY_AUDIT_v0.8.md` deja documentada como "pendiente, no aplicable
hoy" precisamente porque su precondición (esta tabla) no existe en `main`.
Este diseño la cierra desde el día uno (§4.3), como esa auditoría exige
explícitamente para cuando este feature se proponga formalmente.

---

## 2. Arquitectura propuesta

```
profiles.role   = MODO ACTIVO (qué dashboard/RLS-gate está usando ahora)
user_roles      = ROLES QUE POSEE (puede tener worker + employer a la vez)
```

Las **23 policies RLS existentes** que leen `current_user_role()` (→
`profiles.role`) **no se modifican**. Esto es la decisión de diseño central:
en vez de reescribir el sistema de autorización para soportar multi-valor
(alto riesgo, alto esfuerzo, toca todo el esquema), se añade una tabla nueva
que registra qué roles posee el usuario, y una Server Action que cambia
`profiles.role` — el modo activo — de forma instantánea, sin re-login, entre
los roles que el usuario ya posee. `profiles.role` sigue siendo la única
fuente que consulta RLS; `user_roles` es la fuente de "qué puede activar".

Esto cumple lo pedido — "no queremos reemplazar `profiles.role` porque
perdería escalabilidad" — literalmente: `profiles.role` no se toca en su
semántica ni en ninguna policy, solo se le añade una tabla satélite.

### 2.1 Tabla nueva: `user_roles`

```sql
create table public.user_roles (
  id          uuid         primary key default uuid_generate_v4(),
  user_id     uuid         not null references public.profiles(id) on delete cascade,
  role        user_role    not null,        -- reutiliza el enum existente
  active      boolean      not null default true,
  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now(),
  unique (user_id, role)
);
```

`active` permite "desactivar" un rol (p. ej. dejar de ofrecer empleos) sin
perder el historial ni las filas que ese rol posea en otras tablas (`jobs`,
`ratings`, etc. — todas siguen apuntando a `profiles.id`, no a `user_roles`,
así que desactivar un rol nunca es destructivo).

### 2.2 Helper SQL: `user_has_role(role)`

```sql
create or replace function public.user_has_role(check_role user_role)
returns boolean as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = check_role and active = true
  );
$$ language sql stable security definer set search_path = public;
```

No se usa en ninguna policy RLS existente (evita tocar las 23 policies) —
es para uso desde Server Actions (`hasRole()`, ver §5).

---

## 3. Migración de datos existentes

Un solo `INSERT ... SELECT` retroactivo, ejecutado dentro de la misma
migración que crea la tabla — cada usuario existente obtiene su `role`
actual como su primera fila en `user_roles`, sin ninguna pérdida ni cambio
visible para nadie que hoy solo tenga un rol:

```sql
insert into public.user_roles (user_id, role)
select id, role from public.profiles
on conflict (user_id, role) do nothing;
```

`handle_new_user()` (`0001_init.sql`, ya modificado por `0006`) se actualiza
para además insertar en `user_roles` al crear la cuenta — mismo patrón
`on conflict do nothing` que ya usa hoy para `profiles`, así que un signup
duplicado (OAuth reintentando el trigger) sigue siendo inofensivo.

**No hay downtime ni ventana de inconsistencia**: la migración crea la
tabla, la puebla y actualiza el trigger en una sola transacción — no hay
paso intermedio donde `user_roles` exista vacía mientras `profiles` ya tiene
usuarios.

---

## 4. Estrategia RLS

### 4.1 Habilitar RLS y policy de lectura

```sql
alter table public.user_roles enable row level security;

create policy "user_roles_select_own"
  on public.user_roles for select
  using (auth.uid() = user_id or public.current_user_role() = 'admin');
```

### 4.2 Policy de inserción — el usuario solo puede añadirse worker/employer

```sql
create policy "user_roles_insert_own"
  on public.user_roles for insert
  with check (
    auth.uid() = user_id
    and role in ('worker', 'employer')   -- nunca 'admin'
  );
```

Idéntica a la del PR #15 original — esta parte ya estaba bien escrita ahí.

### 4.3 Policy de actualización — el hueco V4, cerrado con doble candado

Esto es lo que el intento anterior dejó abierto. Se cierra con el mismo
patrón de **defense-in-depth por columna** que ya estableció
`0013_harden_profile_module_rls.sql` para `profile_photos`/`profile_stats`
(documentado en `CLAUDE.md`: *"when a column's value must be trusted, lock
the column at the grant level rather than relying on WITH CHECK alone"*):

```sql
-- Candado 1: RLS con WITH CHECK explícito (nunca solo USING)
create policy "user_roles_update_own"
  on public.user_roles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and role in ('worker', 'employer'));

-- Candado 2: a nivel de columna — 'active' es la única columna que
-- cualquier Server Action de producción necesita tocar (activar/desactivar
-- un rol). 'role' y 'user_id' nunca deben ser mutables tras el INSERT.
revoke update on public.user_roles from authenticated;
grant update (active) on public.user_roles to authenticated;
```

Con esto, aunque alguien encuentre una forma de saltarse el `WITH CHECK` (o
se introduzca un bug futuro que lo debilite), el `GRANT` a nivel de columna
sigue bloqueando cualquier intento de `UPDATE ... SET role = 'admin'`
independientemente de lo que diga la policy — exactamente el mismo
razonamiento que ya se aplicó a `profile_photos.storage_path`.

### 4.4 Policy de borrado

```sql
create policy "user_roles_delete_admin"
  on public.user_roles for delete
  using (public.current_user_role() = 'admin');
```

Un usuario no puede borrar sus propias filas de `user_roles` (evita perder
el historial); solo puede desactivarlas vía `active = false` (candado 2 lo
permite). Solo un admin puede borrar filas — moderación, no autoservicio.

### 4.5 Test SQL requerido antes de mergear

Siguiendo la convención ya establecida (`supabase/tests/*.test.sql`, un
archivo por migración de seguridad), la migración de `user_roles` necesita
su propio `.test.sql` con, como mínimo:

| Bloque | Escenario | Resultado esperado |
|---|---|---|
| N1 | Usuario intenta `UPDATE user_roles SET role = 'admin' WHERE user_id = auth.uid()` | Rechazado (columna `role` sin `GRANT UPDATE`) |
| N2 | Usuario intenta `INSERT INTO user_roles (user_id, role) VALUES (auth.uid(), 'admin')` | Rechazado por `WITH CHECK` |
| N3 | Usuario intenta insertar/actualizar una fila de `user_roles` de **otro** `user_id` | Rechazado |
| P1 | Usuario activa su propio rol `employer` vía `active = true` (columna permitida) | Aceptado |
| P2 | Usuario con ambos roles activos lee su propia fila `worker` y `employer` | Aceptado |
| P3 | Admin real borra una fila de `user_roles` de cualquier usuario | Aceptado |

Esto replica exactamente la disciplina de `0009_fix_v1_role_escalation.test.sql`
— correr contra Postgres 16 real con todas las migraciones aplicadas en
orden, antes de aprobar el merge de esta pieza.

---

## 5. Compatibilidad con el código actual — qué se toca y qué no

**No se toca (garantizado por el diseño, no por promesa):**
- Ninguna de las 23 policies RLS existentes sobre `profiles`, `jobs`,
  `job_applications`, `ratings`, ni las de los módulos de perfil
  profesional (`0010`-`0013`) — todas siguen leyendo `current_user_role()` →
  `profiles.role`, sin cambios.
- El redirect actual `/dashboard` → `/dashboard/worker` o
  `/dashboard/employer` según `profile.role` (`src/app/dashboard/page.tsx`)
  sigue funcionando exactamente igual para el 100% de usuarios que hoy solo
  tienen un rol (`userRoles.length === 1` → nunca ven ningún selector nuevo).
- `login`/`register`/`logout` (`src/lib/actions/auth.ts`) — sin cambios.
  Registro sigue creando un solo rol inicial, ahora también reflejado en
  `user_roles` vía el trigger actualizado.
- El flujo del Worker Dashboard tal como existe hoy — cero cambios de
  comportamiento si el usuario no tiene rol `employer`.

**Se añade (aditivo, no reemplaza nada):**
- `getCurrentUserAndProfile()` (`src/lib/get-current-profile.ts`) — hoy
  devuelve `{ user, profile }`; se le añade `userRoles: UserRole[]` a la
  misma respuesta (un `Promise.all` adicional dentro de la función ya
  envuelta en `cache()`, mismo patrón que ya usa). Cualquier caller
  existente que no lea el campo nuevo sigue funcionando sin tocarlo.
- `src/lib/actions/roles.ts` (nuevo): `getUserRoles()`, `hasRole()`,
  `enableEmployerRole()`, `switchRoleAction()` — necesarias para que el
  botón "+ Publicar Chamba" de la propuesta original funcione (CASO 1:
  auto-provisionar `employer`; CASO 2: cambiar de modo). El diseño de estas
  cuatro funciones ya existe y fue revisado en el PR #15 descartado; se
  reutiliza su forma (usan el cliente de sesión normal, no el admin client
  — correcto, porque ahora la RLS de §4 sí es segura para autoservicio).
- Componentes de UI nuevos bajo `src/components/roles/` — fuera del
  alcance de este documento (es la propuesta de navegación original; se
  retoma una vez aprobado esto).

---

## 6. Qué NO incluye este diseño (a propósito)

- **Reputación separada worker/employer** (`rated_as_role`,
  `worker_rating_summary`/`employer_rating_summary` del PR #15) — es una
  mejora de producto independiente, no una precondición para "+ Publicar
  Chamba". Se deja fuera para no repetir el error original (bundlear
  features sin relación).
- **Página `/dashboard/settings`** con panel de gestión de roles — el
  Navbar/menú de usuario pedido en la conversación original ya cubre
  activar el rol employer vía el botón; un panel dedicado es un documento
  aparte si se decide construirlo.
- **Migración de `profiles.role` a un tipo array o eliminación de la
  columna** — explícitamente descartado por el usuario ("no queremos
  reemplazar `profiles.role` porque perdería escalabilidad"); este diseño
  la mantiene intacta como el modo activo.

---

## 7. Plan de implementación (una vez aprobado este documento)

1. `supabase/migrations/0014_multi_role.sql` — tabla, RLS (con el fix de
   §4.3 desde el primer commit, no como parche posterior), migración de
   datos, `user_has_role()`, trigger `handle_new_user()` actualizado.
2. `supabase/tests/0014_multi_role.test.sql` — los 6 bloques de §4.5,
   ejecutados contra Postgres 16 real antes de dar la migración por cerrada.
3. `src/lib/actions/roles.ts` + actualización de
   `src/lib/get-current-profile.ts`.
4. Recién en este punto: la propuesta de navegación original ("+ Publicar
   Chamba", menú de usuario con Panel Trabajador/Panel Empleador,
   responsive) puede implementarse, porque `enableEmployerRole()` y
   `switchRoleAction()` ya existen y son seguros.
5. `tsc --noEmit`, `lint`, `build` en cada paso — igual que en todo el resto
   del proyecto.

**No se ha modificado ningún archivo de código ni de migraciones todavía.**
Este documento es la propuesta completa; queda a la espera de aprobación
explícita antes de crear la migración `0014` o tocar cualquier Server
Action.
