-- ============================================================
-- CHAMBY — Sprint de Seguridad: endurece V2 y V3 (revisión post-PR)
--
-- 0007_fix_v2_v3_security.sql cerró el camino de INSERT para V2/V3, pero
-- dejó abiertos dos caminos de UPDATE que logran el mismo resultado:
--
-- V2 (autocontratación) vía UPDATE en job_applications:
--   "applications_update" (0001_init.sql) no tenía WITH CHECK y no
--   restringía qué columnas se podían escribir. Esto permitía:
--   a) que un worker pusiera su propia postulación 'pendiente' en
--      'aceptado' sin decisión del empleador (autoaceptación — el
--      trigger handle_application_accepted() no valida quién ejecuta
--      el UPDATE, solo que status pase a 'aceptado'), y
--   b) que el empleador de un job reescribiera worker_id de CUALQUIER
--      postulación existente hacia sí mismo (secuestro de postulación).
--
-- V3 (calificaciones falsas) vía UPDATE directo en jobs:
--   "jobs_update_owner_or_admin" (0001_init.sql) tampoco tenía WITH CHECK
--   y no restringía columnas. La policy de ratings (0007) confía en
--   jobs.status/jobs.assigned_worker_id como fuente de verdad, pero un
--   empleador podía fabricar ambos directamente
--   (`update jobs set status='completado', assigned_worker_id=<arbitrario>`)
--   sin postulación ni aceptación real, y luego calificar esa relación
--   fabricada — esto invalida la garantía de V3.
--
-- Corrección: privilegios a nivel de columna (REVOKE/GRANT) para que
-- `authenticated` nunca pueda escribir las columnas de identidad/estado
-- controladas por los triggers (assigned_worker_id, hired_at en jobs;
-- job_id, worker_id en job_applications), más policies WITH CHECK que
-- atan cada transición de status al rol correcto. Los triggers
-- security definer (handle_application_accepted) siguen funcionando sin
-- cambios: corren con los privilegios del dueño de la tabla, a quien el
-- REVOKE de `authenticated` no afecta.
-- ============================================================

-- ------------------------------------------------------------
-- job_applications: job_id y worker_id inmutables tras el INSERT.
-- RLS no puede comparar la fila vieja con la nueva dentro de una misma
-- expresión (USING ve la fila vieja, WITH CHECK ve la nueva, pero no
-- hay forma de correlacionar ambas en una policy). El mecanismo correcto
-- para "esta columna nunca cambia" en Postgres es el privilegio de
-- columna: si `authenticated` no tiene UPDATE sobre job_id/worker_id,
-- ningún UPDATE que intente tocarlas puede ejecutarse, sin importar RLS.
-- ------------------------------------------------------------
revoke update on public.job_applications from authenticated;
grant update (status) on public.job_applications to authenticated;

-- Transición de status atada al rol: el empleador del job solo puede
-- mover pendiente -> aceptado/rechazado; el propio worker solo puede
-- mover pendiente -> retirado. Cualquier otra combinación (incluyendo
-- autoaceptación) queda fuera de USING (fila de origen) o de WITH CHECK
-- (fila resultante). Admin conserva el bypass total (igual que el resto
-- de policies admin-gated del esquema, ver PR #15).
drop policy if exists "applications_update" on public.job_applications;
create policy "applications_update"
  on public.job_applications for update
  using (
    public.current_user_role() = 'admin'
    or (
      status = 'pendiente'
      and (
        auth.uid() = worker_id
        or auth.uid() in (select employer_id from public.jobs where jobs.id = job_id)
      )
    )
  )
  with check (
    public.current_user_role() = 'admin'
    or (auth.uid() = worker_id and status = 'retirado')
    or (
      status in ('aceptado', 'rechazado')
      and auth.uid() in (select employer_id from public.jobs where jobs.id = job_id)
    )
  );

-- ------------------------------------------------------------
-- jobs: assigned_worker_id, hired_at y employer_id inmutables para
-- `authenticated`. Solo el trigger handle_application_accepted() (dueño
-- de la tabla, security definer) puede escribirlas. Esto es lo que
-- realmente cierra V3: sin poder forjar assigned_worker_id, no hay forma
-- de fabricar una "relación completada" con un perfil arbitrario.
-- ------------------------------------------------------------
revoke update on public.jobs from authenticated;
grant update (status, completed_at, cancelled_at) on public.jobs to authenticated;

-- Transición de status atada al rol para las columnas que sí puede
-- tocar el empleador directamente: abierto/en_progreso -> cancelado
-- (cancelJob/updateJobStatus permiten cancelar en ambos estados) y
-- en_progreso -> completado (completeJob/updateJobStatus). Un job ya
-- terminal (completado/cancelado) no puede volver a escribirse por esta
-- vía. Admin conserva el bypass total (moderación libre, ya usada por
-- adminUpdateJobStatus/AdminJobRow con cualquier estado de origen).
drop policy if exists "jobs_update_owner_or_admin" on public.jobs;
create policy "jobs_update_owner_or_admin"
  on public.jobs for update
  using (
    public.current_user_role() = 'admin'
    or (auth.uid() = employer_id and status in ('abierto', 'en_progreso'))
  )
  with check (
    public.current_user_role() = 'admin'
    or (auth.uid() = employer_id and status in ('cancelado', 'completado'))
  );
