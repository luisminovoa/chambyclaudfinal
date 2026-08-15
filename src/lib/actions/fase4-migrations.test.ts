import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Verificación ESTÁTICA del SQL de 0022/0023 — lee el texto de las
 * migraciones y comprueba invariantes por inspección de patrones, NO
 * ejecuta nada contra un Postgres real (esta sesión no tiene acceso a
 * uno). Mismo límite ya documentado en reports-migration.test.ts
 * (Fase 1) — un test estático que pasa no es evidencia de que la
 * policy/trigger se comporte correctamente en producción, solo de que
 * el SQL declarado contiene lo que se espera.
 */

const migrationsDir = path.resolve(__dirname, "../../../supabase/migrations");
const sql0022 = readFileSync(path.join(migrationsDir, "0022_report_evidence_delete.sql"), "utf-8");
const sql0023 = readFileSync(path.join(migrationsDir, "0023_report_notifications.sql"), "utf-8");

describe("0022_report_evidence_delete.sql — invariantes estáticos", () => {
  it("agrega policy DELETE para report_evidence acotada a dueño + reporte pending", () => {
    const policy = sql0022.match(/create policy "report_evidence_delete_own_pending"[\s\S]*?;/)?.[0] ?? "";
    expect(policy).toMatch(/uploaded_by\s*=\s*auth\.uid\(\)/);
    expect(policy).toMatch(/status\s*=\s*'pending'/);
  });

  it("agrega la columna file_size sin redefinir ninguna policy existente de 0019", () => {
    expect(sql0022).toMatch(/add column if not exists file_size bigint/);
    // No debe redefinir (create policy) report_evidence_insert_own ni
    // report_evidence_select_own_or_admin — solo pueden mencionarse en
    // comentarios explicando el porqué, viven en 0019, no aquí.
    expect(sql0022).not.toMatch(/create policy "report_evidence_insert_own"/);
    expect(sql0022).not.toMatch(/create policy "report_evidence_select_own_or_admin"/);
  });
});

describe("0023_report_notifications.sql — invariantes estáticos", () => {
  it("sigue el patrón de triggers security definer ya establecido (0004/0016) — ninguna Server Action inserta en notifications directamente", () => {
    const definerCount = (sql0023.match(/language plpgsql security definer set search_path = public/g) ?? [])
      .length;
    expect(definerCount).toBe(2);
  });

  it("notify_report_status_changed: dispara en reports AFTER UPDATE y nunca referencia admin_notes/reviewed_by en el cuerpo insertado", () => {
    const fn = sql0023.match(/create or replace function public\.notify_report_status_changed[\s\S]*?\$\$ language/)?.[0] ?? "";
    expect(fn).not.toMatch(/admin_notes/);
    expect(fn).not.toMatch(/reviewed_by/);
    expect(sql0023).toMatch(/after update on public\.reports/);
  });

  it("notify_report_status_changed inserta como máximo una notificación por ejecución (sin duplicados)", () => {
    const fn = sql0023.match(/create or replace function public\.notify_report_status_changed[\s\S]*?\$\$ language/)?.[0] ?? "";
    const insertCount = (fn.match(/insert into public\.notifications/g) ?? []).length;
    expect(insertCount).toBe(1);
  });

  it("notify_moderation_action: dispara en moderation_actions AFTER INSERT, solo para tipos con consecuencia real, y nunca referencia report_id/reason/reporter en el cuerpo insertado", () => {
    const fn = sql0023.match(/create or replace function public\.notify_moderation_action[\s\S]*?\$\$ language/)?.[0] ?? "";
    expect(fn).toMatch(/warning_issued/);
    expect(fn).toMatch(/temporary_suspension/);
    expect(fn).toMatch(/permanent_block/);
    expect(fn).not.toMatch(/note_added/);
    expect(fn).not.toMatch(/new\.report_id/);
    expect(fn).not.toMatch(/new\.reason/);
    expect(sql0023).toMatch(/after insert on public\.moderation_actions/);
  });

  it("notify_moderation_action inserta como máximo una notificación por ejecución", () => {
    const fn = sql0023.match(/create or replace function public\.notify_moderation_action[\s\S]*?\$\$ language/)?.[0] ?? "";
    const insertCount = (fn.match(/insert into public\.notifications/g) ?? []).length;
    expect(insertCount).toBe(1);
  });
});
