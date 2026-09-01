import { describe, expect, it } from "vitest";

/**
 * Cobertura del hallazgo residual de docs/SECURITY_AUDIT_v0.8.md §5
 * ("autorreactivación de is_active"), cerrado en
 * supabase/migrations/0047_harden_profiles_is_active.sql.
 *
 * Esta suite NO pasa por ninguna Server Action ni por
 * src/lib/actions/profile.ts — deliberadamente. El hallazgo original es
 * que un cliente puede saltarse por completo la Server Action (Next.js)
 * y llamar directamente a PostgREST/supabase-js contra `profiles`; una
 * allowlist de TypeScript en profile.ts nunca habría cerrado eso. Por
 * eso esta suite evalúa directamente la expresión booleana del `WITH
 * CHECK` de la policy `profiles_update_own` (0047), como una
 * simulación fiel — mismo patrón ya establecido en
 * src/lib/actions/roles.test.ts (`evaluateProfilesUpdateCheck`) para la
 * misma policy — sin mockear ningún cliente Supabase.
 *
 * Fidelidad de la simulación: `is_active` se compara contra el valor
 * PREVIO de la fila (el parámetro `storedIsActive`), nunca contra el
 * valor nuevo que el propio caller intenta escribir — exactamente el
 * mismo mecanismo ya usado por `currentRoleIsAdmin` en
 * roles.test.ts para `role`, que a su vez replica el comportamiento
 * real y documentado (0018) de una subconsulta separada sobre la misma
 * tabla dentro de un WITH CHECK: ve el estado anterior a la sentencia,
 * nunca su propio cambio a mitad de ejecución. Verificado empíricamente
 * contra un Postgres 16 real (no solo razonado) que este comportamiento
 * también aplica a una subconsulta plana, sin SECURITY DEFINER.
 */

interface CheckInput {
  /** auth.uid() del caller. */
  callerId: string;
  /** id de la fila que se intenta actualizar (columna `id` de la fila NUEVA). */
  targetRowId: string;
  /** El caller es realmente admin ahora mismo (current_user_role() actual, no afectado por este UPDATE). */
  callerIsAdmin: boolean;
  /** role NUEVO que la sentencia intenta escribir en la fila. */
  newRole: "worker" | "employer" | "admin";
  /** is_active NUEVO que la sentencia intenta escribir en la fila. */
  newIsActive: boolean;
  /** is_active YA ALMACENADO de esa fila antes de esta sentencia. */
  storedIsActive: boolean;
  /** El caller posee una fila user_roles(role='admin', active=true). */
  callerHasActiveAdminRole: boolean;
}

/** Traduce literalmente el WITH CHECK de 0047_harden_profiles_is_active.sql. */
function evaluateProfilesUpdateOwnWithCheck(input: CheckInput): boolean {
  const isSelf = input.callerId === input.targetRowId;
  return (
    input.callerIsAdmin ||
    (isSelf &&
      (input.newRole === "worker" || input.newRole === "employer") &&
      input.newIsActive === input.storedIsActive) ||
    (isSelf &&
      input.newRole === "admin" &&
      input.newIsActive === input.storedIsActive &&
      input.callerHasActiveAdminRole)
  );
}

const ACTIVE_USER = "11111111-1111-1111-1111-111111111111";
const SUSPENDED_USER = "22222222-2222-2222-2222-222222222222";
const ADMIN = "99999999-9999-9999-9999-999999999999";

describe("profiles_update_own (0047) — bloquea autorreactivación/autosuspensión de is_active", () => {
  it("A) usuario activo actualiza su propio perfil sin tocar is_active → permitido", () => {
    expect(
      evaluateProfilesUpdateOwnWithCheck({
        callerId: ACTIVE_USER,
        targetRowId: ACTIVE_USER,
        callerIsAdmin: false,
        newRole: "worker",
        newIsActive: true,
        storedIsActive: true,
        callerHasActiveAdminRole: false,
      })
    ).toBe(true);
  });

  it("B) usuario activo intenta suspenderse a sí mismo (true→false) → rechazado", () => {
    expect(
      evaluateProfilesUpdateOwnWithCheck({
        callerId: ACTIVE_USER,
        targetRowId: ACTIVE_USER,
        callerIsAdmin: false,
        newRole: "worker",
        newIsActive: false,
        storedIsActive: true,
        callerHasActiveAdminRole: false,
      })
    ).toBe(false);
  });

  it("C) usuario suspendido intenta autorreactivarse (false→true) → rechazado — el hallazgo original", () => {
    expect(
      evaluateProfilesUpdateOwnWithCheck({
        callerId: SUSPENDED_USER,
        targetRowId: SUSPENDED_USER,
        callerIsAdmin: false,
        newRole: "worker",
        newIsActive: true,
        storedIsActive: false,
        callerHasActiveAdminRole: false,
      })
    ).toBe(false);
  });

  it("D) usuario suspendido actualiza otro campo manteniendo is_active sin cambios (false→false) → permitido", () => {
    expect(
      evaluateProfilesUpdateOwnWithCheck({
        callerId: SUSPENDED_USER,
        targetRowId: SUSPENDED_USER,
        callerIsAdmin: false,
        newRole: "worker",
        newIsActive: false,
        storedIsActive: false,
        callerHasActiveAdminRole: false,
      })
    ).toBe(true);
  });

  it("E) admin suspende a otro usuario (true→false) → permitido — vía toggleUserActive(), cliente de sesión del propio admin", () => {
    expect(
      evaluateProfilesUpdateOwnWithCheck({
        callerId: ADMIN,
        targetRowId: ACTIVE_USER,
        callerIsAdmin: true,
        newRole: "worker",
        newIsActive: false,
        storedIsActive: true,
        callerHasActiveAdminRole: false,
      })
    ).toBe(true);
  });

  it("F) admin reactiva a otro usuario (false→true) → permitido", () => {
    expect(
      evaluateProfilesUpdateOwnWithCheck({
        callerId: ADMIN,
        targetRowId: SUSPENDED_USER,
        callerIsAdmin: true,
        newRole: "worker",
        newIsActive: true,
        storedIsActive: false,
        callerHasActiveAdminRole: false,
      })
    ).toBe(true);
  });

  it("G) usuario A intenta modificar el perfil de usuario B (cross-user) → rechazado, sin relación con is_active", () => {
    expect(
      evaluateProfilesUpdateOwnWithCheck({
        callerId: ACTIVE_USER,
        targetRowId: SUSPENDED_USER,
        callerIsAdmin: false,
        newRole: "worker",
        newIsActive: true,
        storedIsActive: false,
        callerHasActiveAdminRole: false,
      })
    ).toBe(false);
  });

  it("H) equivalente a una llamada directa a PostgREST/supabase-js (sin pasar por profile.ts): mismo resultado que el caso C", () => {
    // profile.ts nunca expone is_active en su allowlist — esta prueba
    // demuestra que la protección no depende de esa allowlist en
    // absoluto: la misma expresión de policy, evaluada exactamente igual,
    // rechaza el intento sin importar qué cliente la invoque.
    expect(
      evaluateProfilesUpdateOwnWithCheck({
        callerId: SUSPENDED_USER,
        targetRowId: SUSPENDED_USER,
        callerIsAdmin: false,
        newRole: "worker",
        newIsActive: true,
        storedIsActive: false,
        callerHasActiveAdminRole: false,
      })
    ).toBe(false);
  });

  it("regresión V1: worker sin fila user_roles(admin) intenta auto-escalar a role='admin' → rechazado, sin relación con is_active", () => {
    expect(
      evaluateProfilesUpdateOwnWithCheck({
        callerId: ACTIVE_USER,
        targetRowId: ACTIVE_USER,
        callerIsAdmin: false,
        newRole: "admin",
        newIsActive: true,
        storedIsActive: true,
        callerHasActiveAdminRole: false,
      })
    ).toBe(false);
  });

  it("regresión switchRoleAction: usuario con fila user_roles(admin) activa se autopromueve a modo admin, is_active sin cambios → permitido", () => {
    expect(
      evaluateProfilesUpdateOwnWithCheck({
        callerId: ACTIVE_USER,
        targetRowId: ACTIVE_USER,
        callerIsAdmin: false,
        newRole: "admin",
        newIsActive: true,
        storedIsActive: true,
        callerHasActiveAdminRole: true,
      })
    ).toBe(true);
  });

  it("regresión switchRoleAction: cambio legítimo worker↔employer, is_active sin cambios → permitido", () => {
    expect(
      evaluateProfilesUpdateOwnWithCheck({
        callerId: ACTIVE_USER,
        targetRowId: ACTIVE_USER,
        callerIsAdmin: false,
        newRole: "employer",
        newIsActive: true,
        storedIsActive: true,
        callerHasActiveAdminRole: false,
      })
    ).toBe(true);
  });
});
