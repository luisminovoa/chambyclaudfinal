-- ============================================================
-- CHAMBY — SEC: restringir EXECUTE de funciones SECURITY DEFINER
--
-- Hallazgo (auditoría de solo lectura, ver evidencia en el repo):
--   · current_user_role() (0001): la usan 35 policies RLS vigentes, que se
--     evalúan con el rol que consulta — `authenticated` DEBE conservar
--     EXECUTE. Ningún flujo anónimo de la app depende de ella.
--   · user_has_role(user_role) (0014): código muerto — ninguna policy,
--     trigger, Server Action ni RPC la usa.
--   · rls_auto_enable(): no proviene de ninguna migración de este
--     repositorio (objeto de la plataforma, usado por el event trigger
--     ensure_rls). Un event trigger no comprueba EXECUTE del usuario al
--     dispararse.
--
-- Por qué se revoca también a PUBLIC: en Postgres toda función nace con
-- EXECUTE concedido a PUBLIC (pseudo-rol que incluye a anon y authenticated).
-- Un `REVOKE ... FROM anon` por sí solo NO quita ese acceso: has_function_
-- privilege('anon', ...) seguiría devolviendo true vía PUBLIC. Por eso se
-- revoca de PUBLIC y se conceden de forma explícita los roles que sí deben
-- ejecutar cada función.
--
-- Efecto sobre anon: las tablas cuyas policies evalúan current_user_role()
-- (profiles, job_applications, reports, messages, ...) pasan de devolver
-- "0 filas" a fallar con 42501 (permission denied for function
-- current_user_role) para un visitante sin sesión. Las superficies públicas
-- (jobs, public_profiles, rating_summary, disponibilidad) no la evalúan para
-- anon y siguen funcionando.
--
-- No se revoca nada a service_role ni a postgres (dueño); service_role se
-- concede explícitamente. No se modifica ninguna otra función, policy ni
-- tabla. Es idempotente: se puede aplicar más de una vez.
-- ============================================================

-- current_user_role(): authenticated y service_role SÍ; PUBLIC y anon NO.
REVOKE EXECUTE ON FUNCTION public.current_user_role()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role()
  TO authenticated, service_role;

-- user_has_role(user_role): solo service_role (código muerto en la app).
REVOKE EXECUTE ON FUNCTION public.user_has_role(check_role user_role)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_role(check_role user_role)
  TO service_role;

-- rls_auto_enable(): objeto de la plataforma Supabase; no lo crea ninguna
-- migración de este repo, así que solo se toca si existe (entornos limpios,
-- previews o un replay desde cero no fallan).
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rls_auto_enable()
      TO service_role;
  END IF;
END
$$;
