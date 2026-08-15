import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Verificación estática del SQL de 0019/0020 — no sustituye pruebas
 * contra un Postgres real (esta sesión no tiene acceso a uno, mismo
 * límite documentado en docs/user-reporting-moderation-design.md
 * §19), pero da protección de regresión automática: si alguien borra
 * una policy crítica o vuelve público el bucket de evidencia, este
 * test falla en CI antes de que el cambio llegue a producción. Cubre
 * los escenarios de la Parte J que no pueden probarse mockeando el
 * cliente de Supabase (RLS/Storage es responsabilidad de Postgres, no
 * del código TypeScript que lo llama).
 */

const migrationsDir = path.resolve(__dirname, "../../../supabase/migrations");
const sql0019 = readFileSync(path.join(migrationsDir, "0019_user_reports_moderation.sql"), "utf-8");
const sql0020 = readFileSync(path.join(migrationsDir, "0020_moderation_actions.sql"), "utf-8");
const sql0021 = readFileSync(
  path.join(migrationsDir, "0021_reporter_reports_view_description.sql"),
  "utf-8"
);

describe("0019_user_reports_moderation.sql — invariantes de seguridad", () => {
  it("RLS está habilitado en reports y report_evidence", () => {
    expect(sql0019).toMatch(/alter table public\.reports enable row level security/);
    expect(sql0019).toMatch(/alter table public\.report_evidence enable row level security/);
  });

  it("5. usuario no puede modificar campos administrativos al insertar: el CHECK de insert exige status='pending' y admin_notes/reviewed_by nulos", () => {
    const insertPolicy = sql0019.match(/create policy "reports_insert_own"[\s\S]*?;/)?.[0] ?? "";
    expect(insertPolicy).toMatch(/reporter_id\s*=\s*auth\.uid\(\)/);
    expect(insertPolicy).toMatch(/status\s*=\s*'pending'/);
    expect(insertPolicy).toMatch(/reviewed_by is null/);
    expect(insertPolicy).toMatch(/reviewed_at is null/);
    expect(insertPolicy).toMatch(/admin_notes is null/);
  });

  it("solo admin tiene policy UPDATE sobre reports (ningún usuario normal puede cambiar status/admin_notes tras crear el reporte)", () => {
    const updatePolicy = sql0019.match(/create policy "reports_update_admin"[\s\S]*?;/)?.[0] ?? "";
    expect(updatePolicy).toMatch(/current_user_role\(\)\s*=\s*'admin'/);
    // Solo debe existir una policy "for update" sobre public.reports en todo el archivo (la de admin).
    const updatePolicyCount = (sql0019.match(/on public\.reports for update/g) ?? []).length;
    expect(updatePolicyCount).toBe(1);
  });

  it("reports no tiene policy DELETE — nadie, ni admin, puede borrar un reporte (preserva trazabilidad de moderación)", () => {
    expect(sql0019).not.toMatch(/on public\.reports for delete/);
  });

  it("el UPDATE admin de reports está restringido por columna: reporter_id/target_type/reported_user_id/reported_job_id/related_job_id/created_at son inmutables", () => {
    expect(sql0019).toMatch(/revoke update on public\.reports from authenticated/);
    const grantLine = sql0019.match(/grant update \([^)]*\)\s*\n?\s*on public\.reports to authenticated/)?.[0] ?? "";
    expect(grantLine).toMatch(/status/);
    expect(grantLine).toMatch(/reviewed_by/);
    expect(grantLine).toMatch(/reviewed_at/);
    expect(grantLine).toMatch(/admin_notes/);
    expect(grantLine).toMatch(/updated_at/);
    for (const immutable of [
      "reporter_id",
      "target_type",
      "reported_user_id",
      "reported_job_id",
      "related_job_id",
      "created_at",
    ]) {
      expect(grantLine).not.toMatch(new RegExp(`\\b${immutable}\\b`));
    }
  });

  it("6. reporter_reports_view no expone admin_notes/reviewed_by/reviewed_at", () => {
    const view = sql0019.match(/create or replace view public\.reporter_reports_view[\s\S]*?from public\.reports/)?.[0] ?? "";
    expect(view).not.toMatch(/admin_notes/);
    expect(view).not.toMatch(/reviewed_by/);
    expect(view).not.toMatch(/reviewed_at/);
    expect(view).toMatch(/security_invoker = true/);
  });

  it("9. el bucket report-evidence es privado y sin policy SELECT para authenticated", () => {
    expect(sql0019).toMatch(/'report-evidence',\s*'report-evidence',\s*false,/);
    // Debe existir la policy de INSERT folder-prefijada...
    expect(sql0019).toMatch(/"report_evidence_storage_insert"/);
    // ...pero ninguna policy "for select" sobre storage.objects en este archivo.
    expect(sql0019).not.toMatch(/on storage\.objects\s+for select/);
  });

  it("reports_no_self_report bloquea el auto-reporte a nivel de CHECK, no solo de policy", () => {
    expect(sql0019).toMatch(/constraint reports_no_self_report check/);
    expect(sql0019).toMatch(/reported_user_id is null or reported_user_id <> reporter_id/);
  });
});

describe("0020_moderation_actions.sql — invariantes de seguridad", () => {
  it("RLS está habilitado", () => {
    expect(sql0020).toMatch(/alter table public\.moderation_actions enable row level security/);
  });

  it("10. moderation_actions es append-only: ninguna policy UPDATE/DELETE existe (ni para admin)", () => {
    expect(sql0020).not.toMatch(/on public\.moderation_actions for update/);
    expect(sql0020).not.toMatch(/on public\.moderation_actions for delete/);
  });

  it("la policy INSERT exige admin_id = auth.uid() (no se puede atribuir una acción a otro admin)", () => {
    const insertPolicy = sql0020.match(/create policy "moderation_actions_insert_admin"[\s\S]*?;/)?.[0] ?? "";
    expect(insertPolicy).toMatch(/current_user_role\(\)\s*=\s*'admin'/);
    expect(insertPolicy).toMatch(/admin_id\s*=\s*auth\.uid\(\)/);
  });

  it("report_id usa on delete set null (el historial sobrevive al borrado del reporte)", () => {
    expect(sql0020).toMatch(/report_id\s+uuid references public\.reports\(id\) on delete set null/);
  });
});

describe("0021_reporter_reports_view_description.sql — corrige la vista sin tocar 0019", () => {
  it("agrega description a reporter_reports_view sin exponer columnas administrativas", () => {
    const view = sql0021.match(/create or replace view public\.reporter_reports_view[\s\S]*?from public\.reports/)?.[0] ?? "";
    expect(view).toMatch(/\bdescription\b/);
    expect(view).not.toMatch(/admin_notes/);
    expect(view).not.toMatch(/reviewed_by/);
    expect(view).not.toMatch(/reviewed_at/);
    expect(view).toMatch(/security_invoker = true/);
  });

  it("no modifica 0019 — sigue exactamente como se aprobó en la Fase 1", () => {
    expect(sql0019).toMatch(/select id, target_type, reported_user_id, reported_job_id, related_job_id,\s*\n\s*reason, status, created_at, updated_at/);
  });
});
