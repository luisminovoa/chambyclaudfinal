-- ============================================================
-- CHAMBY — public_profiles: ACL hardening (read-only) — PR 27
--
-- Hallazgo en Production (verificado directamente, no inferido):
-- public.public_profiles (creada en 0034_harden_profiles_public_access.sql
-- como una proyección pública de solo lectura) es una vista simple sobre
-- una única tabla base sin DISTINCT/GROUP BY/agregados/set ops, por lo que
-- Postgres la trata como "auto-updatable" (information_schema.views.
-- is_updatable = 'YES'). 0034 solo otorgó `grant select ... to anon,
-- authenticated;` — nunca otorgó INSERT/UPDATE/DELETE explícitamente —
-- pero la ACL real en Production muestra anon/authenticated/service_role
-- con privilegios completos (arwdDxtm), incluyendo INSERT/UPDATE/DELETE,
-- casi con certeza heredados del aprovisionamiento por defecto de
-- Supabase sobre el esquema `public`, no de nada en este repositorio.
--
-- public_profiles debe ser una PROYECCIÓN PÚBLICA DE SOLO LECTURA. Nadie
-- debería poder escribir una fila de `profiles` a través de esta vista.
--
-- Auditoría de consumidores (previa a esta migración, exhaustiva sobre
-- todo `src/`): los 5 usos reales de `.from("public_profiles")`
-- (src/app/page.tsx, src/app/jobs/page.tsx, src/app/jobs/[id]/page.tsx
-- x2, src/lib/actions/employers.ts) son exclusivamente `.select(...)`
-- con el cliente de sesión (createClient(), roles anon/authenticated).
-- Cero ocurrencias de `.insert(`/`.update(`/`.upsert(`/`.delete(`
-- encadenadas a `.from("public_profiles")` en todo el repositorio.
-- `createAdminClient()` (service_role) nunca se usa contra esta vista en
-- ningún archivo — cuando el código necesita escribir en `profiles`, lo
-- hace directamente contra `public.profiles` (p. ej. src/lib/actions/
-- profile.ts, admin.ts, roles.ts), nunca a través de esta proyección.
-- Por lo tanto ningún rol tiene un consumidor legítimo que necesite
-- INSERT/UPDATE/DELETE mediante public_profiles — tampoco service_role,
-- que de todas formas tiene BYPASSRLS y acceso de escritura directo a
-- `public.profiles`; conservar DML sobre la vista no le da ninguna
-- capacidad real, solo una superficie de escritura innecesaria.
--
-- No se encontró ningún GRANT hacia el pseudo-rol PUBLIC sobre
-- public_profiles en ninguna migración (grep exhaustivo de "to public"
-- en supabase/migrations/*.sql: cero resultados relevantes — Postgres
-- no otorga privilegios de tabla/vista a PUBLIC por defecto). El REVOKE
-- explícito de abajo es defensivo: deja la garantía de "sin privilegios
-- heredados por PUBLIC" verificada en el propio esquema en vez de
-- asumida, sin costo — es un no-op si nunca hubo nada que revocar.
--
-- Esta migración SOLO modifica permisos (GRANT/REVOKE) sobre
-- public.public_profiles. No modifica su definición (columnas, filtros,
-- SELECT subyacente), no modifica public.profiles, no modifica
-- profiles_select_all ni ninguna otra policy, no modifica 0034 ni 0035,
-- no crea tablas ni vistas nuevas, no toca RLS. La fase CONTRACT (0035,
-- ya escrita, todavía sin aplicar en Production) permanece
-- completamente independiente de este cambio.
-- ============================================================

revoke all on public.public_profiles from public;
revoke all on public.public_profiles from anon;
revoke all on public.public_profiles from authenticated;
revoke all on public.public_profiles from service_role;

grant select on public.public_profiles to anon;
grant select on public.public_profiles to authenticated;
grant select on public.public_profiles to service_role;
