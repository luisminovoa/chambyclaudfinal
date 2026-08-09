import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Verificación ESTÁTICA del SQL de 0024/0025 — lee el texto de las
 * migraciones, no ejecuta nada contra un Postgres real (esta sesión no
 * tiene acceso a uno). Mismo límite ya documentado en
 * reports-migration.test.ts/fase4-migrations.test.ts: un test estático que
 * pasa prueba que el SQL declarado contiene el mecanismo esperado, NO que
 * ese mecanismo se comporte correctamente bajo concurrencia real — eso
 * requeriría dos conexiones simultáneas contra un Postgres real, que no
 * está disponible en este entorno.
 */

const migrationsDir = path.resolve(__dirname, "../../../supabase/migrations");
const sql0024 = readFileSync(path.join(migrationsDir, "0024_report_evidence_limit_trigger.sql"), "utf-8");
const sql0025 = readFileSync(path.join(migrationsDir, "0025_reports_job_duplicate_index.sql"), "utf-8");

describe("0024_report_evidence_limit_trigger.sql — garantía atómica del límite de 5", () => {
  it("usa pg_advisory_xact_lock namespaced por report_id antes de contar (el mecanismo real de atomicidad)", () => {
    const fn =
      sql0024.match(/create or replace function public\.enforce_report_evidence_limit[\s\S]*?\$\$ language/)?.[0] ??
      "";
    expect(fn).toMatch(/pg_advisory_xact_lock\(\s*947261\s*,\s*hashtext\(new\.report_id::text\)\s*\)/);
    // El lock debe adquirirse ANTES del conteo, no después — si no, no sirve de nada.
    const lockIndex = fn.indexOf("pg_advisory_xact_lock");
    const countIndex = fn.indexOf("count(*)");
    expect(lockIndex).toBeGreaterThan(-1);
    expect(countIndex).toBeGreaterThan(-1);
    expect(lockIndex).toBeLessThan(countIndex);
  });

  it("rechaza con una excepción identificable (report_evidence_limit_exceeded) cuando el conteo ya alcanzó 5", () => {
    const fn =
      sql0024.match(/create or replace function public\.enforce_report_evidence_limit[\s\S]*?\$\$ language/)?.[0] ??
      "";
    expect(fn).toMatch(/>=\s*5/);
    expect(fn).toMatch(/raise exception 'report_evidence_limit_exceeded/);
  });

  it("el trigger corre BEFORE INSERT en report_evidence, para cada fila", () => {
    expect(sql0024).toMatch(/before insert on public\.report_evidence/);
    expect(sql0024).toMatch(/for each row execute function public\.enforce_report_evidence_limit/);
  });

  it("es security definer (el conteo debe ver todas las filas del reporte, no solo las que RLS dejaría ver al reportante)", () => {
    expect(sql0024).toMatch(/language plpgsql security definer set search_path = public/);
  });

  it("no modifica ninguna policy ni tabla existente de 0019-0023 — es puramente aditivo", () => {
    expect(sql0024).not.toMatch(/create policy/);
    expect(sql0024).not.toMatch(/drop policy/);
    expect(sql0024).not.toMatch(/alter table/i);
    expect(sql0024).not.toMatch(/create table/i);
  });
});

describe("0025_reports_job_duplicate_index.sql — anti-duplicado para reportes de oferta", () => {
  it("crea un índice único parcial análogo a reports_no_duplicate_active (0019), pero para reported_job_id", () => {
    const idx = sql0025.match(/create unique index if not exists reports_no_duplicate_active_job[\s\S]*?;/)?.[0] ?? "";
    expect(idx).toMatch(/on public\.reports \(reporter_id, reported_job_id, reason\)/);
  });

  it("4/6. el índice es PARCIAL — solo cubre reportes activos (pending/under_review), así que reportes históricos (resolved/dismissed) nunca pueden violarlo, y reportar de nuevo tras resolución es legítimo", () => {
    const idx = sql0025.match(/create unique index if not exists reports_no_duplicate_active_job[\s\S]*?;/)?.[0] ?? "";
    expect(idx).toMatch(/where status in \('pending', 'under_review'\)/);
    expect(idx).toMatch(/and reported_job_id is not null/);
  });

  it("4. distintos reportantes (reporter_id) nunca chocan entre sí — reporter_id es la primera columna del índice, así que el conflicto de unicidad solo ocurre dentro del mismo reportante", () => {
    const idx = sql0025.match(/create unique index if not exists reports_no_duplicate_active_job[\s\S]*?;/)?.[0] ?? "";
    const columnsMatch = idx.match(/\(([^)]+)\)/);
    expect(columnsMatch?.[1].trim().startsWith("reporter_id")).toBe(true);
  });

  it("no modifica ni elimina reports_no_duplicate_active (0019) — solo lo menciona en comentarios, ninguna sentencia SQL lo toca", () => {
    expect(sql0025).not.toMatch(/drop index/i);
    // Solo debe existir UN "create ... index" en todo el archivo (el de _job) — 0019 no se toca aquí.
    const createIndexCount = (sql0025.match(/create unique index/g) ?? []).length;
    expect(createIndexCount).toBe(1);
  });

  it("no modifica ninguna policy RLS ni tabla — solo agrega un índice", () => {
    expect(sql0025).not.toMatch(/create policy/);
    expect(sql0025).not.toMatch(/alter table/i);
  });
});
