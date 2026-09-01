import { describe, expect, it } from "vitest";

/**
 * Cobertura del hallazgo P1 (auditoría post-V6: "Borrado en cascada de
 * jobs completados destruye ratings, applications, conversations/
 * messages y job_state_history"), cerrado en
 * supabase/migrations/0048_protect_job_deletion.sql.
 *
 * Mismo patrón ya establecido en roles.test.ts
 * (`evaluateProfilesUpdateCheck`) y profile-is-active-rls.test.ts
 * (`evaluateProfilesUpdateOwnWithCheck`): esta suite evalúa directamente
 * la expresión booleana del `USING` de la policy `jobs_delete_owner_or_
 * admin` (0048), como simulación fiel — sin mockear ningún cliente
 * Supabase, sin pasar por deleteJob()/adminDeleteJob() (esas Server
 * Actions tienen su propia cobertura en jobs.test.ts/admin.test.ts). La
 * verificación empírica contra Postgres 16 real vive en
 * supabase/tests/0048_protect_job_deletion.test.sql.
 */

type JobStatus = "abierto" | "en_progreso" | "completado" | "cancelado";

interface UsingInput {
  callerId: string;
  jobEmployerId: string;
  jobStatus: JobStatus;
  callerIsAdmin: boolean;
}

/** Traduce literalmente el USING de jobs_delete_owner_or_admin (0048). */
function evaluateJobsDeleteUsing(input: UsingInput): boolean {
  return (
    (input.callerId === input.jobEmployerId || input.callerIsAdmin) &&
    (input.jobStatus === "abierto" || input.jobStatus === "en_progreso")
  );
}

const EMPLOYER_A = "11111111-1111-1111-1111-111111111111";
const EMPLOYER_B = "22222222-2222-2222-2222-222222222222";
const ADMIN = "99999999-9999-9999-9999-999999999999";

describe("jobs_delete_owner_or_admin (0048) — bloquea DELETE sobre jobs terminales", () => {
  it("A) empleador dueño elimina su job abierto → permitido", () => {
    expect(
      evaluateJobsDeleteUsing({
        callerId: EMPLOYER_A,
        jobEmployerId: EMPLOYER_A,
        jobStatus: "abierto",
        callerIsAdmin: false,
      })
    ).toBe(true);
  });

  it("B) empleador dueño elimina su job en_progreso → permitido", () => {
    expect(
      evaluateJobsDeleteUsing({
        callerId: EMPLOYER_A,
        jobEmployerId: EMPLOYER_A,
        jobStatus: "en_progreso",
        callerIsAdmin: false,
      })
    ).toBe(true);
  });

  it("C) empleador dueño intenta eliminar su job completado → rechazado — el hallazgo original", () => {
    expect(
      evaluateJobsDeleteUsing({
        callerId: EMPLOYER_A,
        jobEmployerId: EMPLOYER_A,
        jobStatus: "completado",
        callerIsAdmin: false,
      })
    ).toBe(false);
  });

  it("D) empleador dueño intenta eliminar su job cancelado → rechazado", () => {
    expect(
      evaluateJobsDeleteUsing({
        callerId: EMPLOYER_A,
        jobEmployerId: EMPLOYER_A,
        jobStatus: "cancelado",
        callerIsAdmin: false,
      })
    ).toBe(false);
  });

  it("E) admin intenta eliminar un job completado ajeno → rechazado — el bypass admin también queda restringido a estados terminales", () => {
    expect(
      evaluateJobsDeleteUsing({
        callerId: ADMIN,
        jobEmployerId: EMPLOYER_A,
        jobStatus: "completado",
        callerIsAdmin: true,
      })
    ).toBe(false);
  });

  it("F) admin intenta eliminar un job cancelado ajeno → rechazado", () => {
    expect(
      evaluateJobsDeleteUsing({
        callerId: ADMIN,
        jobEmployerId: EMPLOYER_A,
        jobStatus: "cancelado",
        callerIsAdmin: true,
      })
    ).toBe(false);
  });

  it("G) empleador B intenta eliminar un job de empleador A (no dueño) → rechazado, sin relación con el status", () => {
    expect(
      evaluateJobsDeleteUsing({
        callerId: EMPLOYER_B,
        jobEmployerId: EMPLOYER_A,
        jobStatus: "abierto",
        callerIsAdmin: false,
      })
    ).toBe(false);
  });

  it("control: admin SÍ conserva el bypass de DELETE para estados no terminales (abierto)", () => {
    expect(
      evaluateJobsDeleteUsing({
        callerId: ADMIN,
        jobEmployerId: EMPLOYER_A,
        jobStatus: "abierto",
        callerIsAdmin: true,
      })
    ).toBe(true);
  });

  it("control: admin SÍ conserva el bypass de DELETE para estados no terminales (en_progreso)", () => {
    expect(
      evaluateJobsDeleteUsing({
        callerId: ADMIN,
        jobEmployerId: EMPLOYER_A,
        jobStatus: "en_progreso",
        callerIsAdmin: true,
      })
    ).toBe(true);
  });
});
