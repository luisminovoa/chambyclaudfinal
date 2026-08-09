#!/usr/bin/env node
// ============================================================
// CHAMBY — Fase 8, Parte F: verificación real de Storage (report-evidence)
// ============================================================
// RLS de reports/report_evidence puede probarse con SQL puro (ver
// reports_security_phase8.sql) porque auth.uid() se puede simular con
// `set request.jwt.claim.sub`. Storage.objects NO puede probarse igual
// desde SQL puro de forma representativa del comportamiento real: la
// app real sube/descarga a través del cliente supabase-js (Storage API
// HTTP), no con INSERT directos a storage.objects, y las políticas de
// storage.objects en 0019 dependen de auth.uid() resuelto por un JWT de
// sesión real, no por una variable de sesión de Postgres. Por eso esto
// es un script Node separado, usando @supabase/supabase-js (ya es
// dependencia del proyecto), NO una suite SQL.
//
// NO EJECUTADO en la sesión que escribió este archivo — no hay ningún
// proyecto Supabase (staging o local) accesible en este entorno (ver
// informe de Fase 7). Este script queda listo para correr en cuanto
// exista uno, contra un proyecto de TEST/STAGING nunca de producción.
//
// ------------------------------------------------------------
// REQUISITOS
// ------------------------------------------------------------
// - PHASE8_SUPABASE_URL: URL del proyecto de TEST/STAGING.
// - PHASE8_SUPABASE_SERVICE_ROLE_KEY: SOLO se usa para (a) crear/borrar
//   los dos usuarios de prueba y (b) leer la config del bucket — NUNCA
//   para sustituir las pruebas de RLS en sí (eso violaría el objetivo
//   de la prueba: confirmar qué puede hacer un cliente NORMAL).
// - PHASE8_CONFIRM_NOT_PROD=yes: guarda explícita adicional, igual que
//   en phase8_concurrency_f6_01.sh.
//
// Uso:
//   PHASE8_SUPABASE_URL=... \
//   PHASE8_SUPABASE_SERVICE_ROLE_KEY=... \
//   PHASE8_CONFIRM_NOT_PROD=yes \
//   node supabase/tests/phase8_storage_check.mjs
//
// ------------------------------------------------------------
// CHECKLIST QUE ESTE SCRIPT CUBRE (Parte F del prompt maestro Fase 8)
// ------------------------------------------------------------
// [ ] bucket report-evidence: public = false
// [ ] bucket report-evidence: allowed_mime_types correctos
// [ ] bucket report-evidence: file_size_limit correcto (10485760 = 10MB)
// [ ] Usuario A SÍ puede subir evidencia bajo su propio prefijo (uid/...)
// [ ] Usuario A NO puede subir bajo el prefijo de Usuario B (spoofing de owner)
// [ ] Path traversal ("../../otro-uid/...") NO logra escapar del propio prefijo
// [ ] Usuario B NO puede leer/descargar el objeto de Usuario A vía URL pública
//     (el bucket es privado — getPublicUrl() no debe servir el archivo)
// [ ] Usuario B NO puede generar su propia signed URL para el objeto de A
//     (storage.objects no tiene NINGUNA policy SELECT para `authenticated`
//     — createSignedUrl() de un cliente de sesión normal debe fallar
//     siempre, sea cual sea el archivo; solo service_role puede firmarla)
// [ ] El usuario REPORTADO (target del reporte) no tiene ningún acceso
//     especial — se comporta igual que "Usuario B" arriba
// ============================================================

import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`ERROR: falta la variable de entorno ${name}. Abortando.`);
    process.exit(1);
  }
  return v;
}

if (process.env.PHASE8_CONFIRM_NOT_PROD !== "yes") {
  console.error(
    "ERROR: define PHASE8_CONFIRM_NOT_PROD=yes para confirmar explícitamente que\n" +
      "       PHASE8_SUPABASE_URL NO apunta a producción. Abortando."
  );
  process.exit(1);
}

const SUPABASE_URL = requireEnv("PHASE8_SUPABASE_URL");
const SERVICE_ROLE_KEY = requireEnv("PHASE8_SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
}

const TEST_EMAIL_A = `chamby-phase8-a-${Date.now()}@example-test.invalid`;
const TEST_EMAIL_B = `chamby-phase8-b-${Date.now()}@example-test.invalid`;
const TEST_PASSWORD = `Phase8Test!${Math.random().toString(36).slice(2)}`;

let userA, userB, reportId;

async function main() {
  console.log("== Fase 8 / Parte F — verificación real de Storage (report-evidence) ==");

  // ------------------------------------------------------------
  // Setup: dos usuarios de prueba reales (service_role, solo para crear
  // cuentas — nunca para las pruebas de acceso en sí).
  // ------------------------------------------------------------
  const { data: createdA, error: errA } = await admin.auth.admin.createUser({
    email: TEST_EMAIL_A,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "worker", full_name: "Fase8 Storage A" },
  });
  if (errA) throw new Error(`No se pudo crear usuario de prueba A: ${errA.message}`);
  userA = createdA.user;

  const { data: createdB, error: errB } = await admin.auth.admin.createUser({
    email: TEST_EMAIL_B,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "worker", full_name: "Fase8 Storage B" },
  });
  if (errB) throw new Error(`No se pudo crear usuario de prueba B: ${errB.message}`);
  userB = createdB.user;

  // Reporte de prueba propiedad de A, en 'pending' (requisito de
  // report_evidence_insert_own, 0019) — creado con service_role solo
  // para fixture, no como sustituto de la Server Action real.
  const { data: reportRow, error: reportErr } = await admin
    .from("reports")
    .insert({
      reporter_id: userA.id,
      target_type: "user",
      reported_user_id: userB.id,
      reason: "other",
      description: "Fase 8 — fixture de Storage",
      status: "pending",
    })
    .select("id")
    .single();
  if (reportErr) throw new Error(`No se pudo crear reporte fixture: ${reportErr.message}`);
  reportId = reportRow.id;

  // ------------------------------------------------------------
  // Config del bucket (solo lectura, vía service_role — no hay forma de
  // leer metadata de bucket con un cliente anon/authenticated, y no
  // hace falta: esto no es una prueba de RLS, es una prueba de config).
  // ------------------------------------------------------------
  const { data: bucket, error: bucketErr } = await admin.storage.getBucket("report-evidence");
  if (bucketErr) throw new Error(`No se pudo leer el bucket report-evidence: ${bucketErr.message}`);
  record("bucket public = false", bucket.public === false, `public=${bucket.public}`);
  record(
    "bucket file_size_limit = 10MB",
    bucket.file_size_limit === 10485760,
    `file_size_limit=${bucket.file_size_limit}`
  );
  const expectedMime = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  const actualMime = bucket.allowed_mime_types ?? [];
  record(
    "bucket allowed_mime_types correctos",
    expectedMime.every((m) => actualMime.includes(m)) && actualMime.length === expectedMime.length,
    `allowed=${JSON.stringify(actualMime)}`
  );

  // ------------------------------------------------------------
  // Clientes de sesión REAL (no service_role) para A y B — estos son
  // los que efectivamente ejercitan storage.objects RLS.
  // ------------------------------------------------------------
  const clientA = createClient(SUPABASE_URL, requireEnv("PHASE8_SUPABASE_ANON_KEY"));
  const { error: signInAErr } = await clientA.auth.signInWithPassword({
    email: TEST_EMAIL_A,
    password: TEST_PASSWORD,
  });
  if (signInAErr) throw new Error(`No se pudo iniciar sesión como A: ${signInAErr.message}`);

  const clientB = createClient(SUPABASE_URL, requireEnv("PHASE8_SUPABASE_ANON_KEY"));
  const { error: signInBErr } = await clientB.auth.signInWithPassword({
    email: TEST_EMAIL_B,
    password: TEST_PASSWORD,
  });
  if (signInBErr) throw new Error(`No se pudo iniciar sesión como B: ${signInBErr.message}`);

  const fakeFile = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });

  // [x] A SÍ puede subir bajo su propio prefijo
  const ownPath = `${userA.id}/${reportId}/evidencia-1.jpg`;
  const { error: uploadOwnErr } = await clientA.storage.from("report-evidence").upload(ownPath, fakeFile);
  record("A sube bajo su propio prefijo", !uploadOwnErr, uploadOwnErr?.message);

  // [x] A NO puede subir bajo el prefijo de B (spoofing de owner)
  const spoofPath = `${userB.id}/${reportId}/evidencia-spoof.jpg`;
  const { error: uploadSpoofErr } = await clientA.storage.from("report-evidence").upload(spoofPath, fakeFile);
  record("A NO puede subir bajo el prefijo de B", !!uploadSpoofErr, uploadSpoofErr?.message ?? "se permitió (MAL)");

  // [x] Path traversal: intento de escapar del propio prefijo
  const traversalPath = `${userA.id}/../${userB.id}/${reportId}/traversal.jpg`;
  const { error: traversalErr } = await clientA.storage.from("report-evidence").upload(traversalPath, fakeFile);
  record(
    "path traversal no logra escapar del propio prefijo",
    !!traversalErr,
    traversalErr?.message ?? "se permitió (MAL)"
  );

  // [x] B no puede leer el objeto de A vía URL pública (bucket privado)
  const { data: publicUrlData } = clientB.storage.from("report-evidence").getPublicUrl(ownPath);
  let publicFetchOk = false;
  try {
    const resp = await fetch(publicUrlData.publicUrl);
    publicFetchOk = resp.ok;
  } catch {
    publicFetchOk = false;
  }
  record("B no puede descargar el archivo de A vía URL pública", !publicFetchOk);

  // [x] B no puede generar su propia signed URL del objeto de A (storage.objects
  //     no tiene policy SELECT para `authenticated` — debe fallar SIEMPRE
  //     desde un cliente de sesión normal, sea cual sea el archivo)
  const { error: signedUrlErr } = await clientB.storage.from("report-evidence").createSignedUrl(ownPath, 300);
  record(
    "B no puede firmar su propia signed URL del objeto de A",
    !!signedUrlErr,
    signedUrlErr?.message ?? "se permitió (MAL)"
  );

  // [x] El usuario REPORTADO (B, en este fixture) tampoco tiene acceso
  //     especial por ser el target del reporte — mismas dos pruebas.
  const { error: reportedSignedUrlErr } = await clientB.storage
    .from("report-evidence")
    .createSignedUrl(ownPath, 300);
  record(
    "el usuario reportado no tiene acceso especial a la evidencia en su contra",
    !!reportedSignedUrlErr,
    reportedSignedUrlErr?.message ?? "se permitió (MAL)"
  );

  // ------------------------------------------------------------
  // Confirmación positiva: SOLO service_role puede firmar la URL real
  // (el mecanismo que report-evidence.ts realmente usa en producción).
  // ------------------------------------------------------------
  const { error: adminSignedUrlErr } = await admin.storage.from("report-evidence").createSignedUrl(ownPath, 300);
  record("service_role SÍ puede firmar la URL (mecanismo real de la app)", !adminSignedUrlErr, adminSignedUrlErr?.message);

  // ------------------------------------------------------------
  // Limpieza
  // ------------------------------------------------------------
  await admin.storage.from("report-evidence").remove([ownPath, spoofPath, traversalPath].filter(Boolean));
  await admin.from("reports").delete().eq("id", reportId);
  await admin.auth.admin.deleteUser(userA.id);
  await admin.auth.admin.deleteUser(userB.id);

  const failed = results.filter((r) => !r.pass);
  console.log("");
  console.log(`== Resultado: ${results.length - failed.length}/${results.length} PASS ==`);
  if (failed.length > 0) {
    console.log("Fallos:");
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail ?? ""}`));
    process.exitCode = 1;
  }
}

main().catch(async (err) => {
  console.error("ERROR FATAL:", err.message);
  // Best-effort cleanup incluso si el script falló a mitad de camino.
  try {
    if (reportId) await admin.from("reports").delete().eq("id", reportId);
    if (userA) await admin.auth.admin.deleteUser(userA.id);
    if (userB) await admin.auth.admin.deleteUser(userB.id);
  } catch {
    // La limpieza es best-effort — si falla, los datos de prueba quedan
    // identificables por el prefijo de email chamby-phase8-*@example-test.invalid.
  }
  process.exit(1);
});
