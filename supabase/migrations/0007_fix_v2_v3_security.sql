-- ============================================================
-- CHAMBY — Sprint de Seguridad: corrige V2 y V3 (docs/AUDITORIA.md)
-- V2: autocontratación — un empleador podía postular a su propio trabajo.
-- V3: calificaciones falsas — se podía calificar a cualquier perfil
--     arbitrario (rated_id no verificado) y antes de completar el trabajo.
-- ============================================================

-- ------------------------------------------------------------
-- V2: applications_insert_worker solo validaba worker_id = auth.uid()
-- y el rol, sin comparar contra jobs.employer_id. Cualquier cuenta capaz
-- de pasar el rol requerido (p. ej. un admin, o un futuro rol combinado)
-- podía postular a un trabajo publicado por sí misma.
-- ------------------------------------------------------------
drop policy if exists "applications_insert_worker" on public.job_applications;
create policy "applications_insert_worker"
  on public.job_applications for insert
  with check (
    auth.uid() = worker_id
    and public.current_user_role() in ('worker', 'admin')
    and auth.uid() <> (select employer_id from public.jobs where jobs.id = job_id)
  );

-- ------------------------------------------------------------
-- V3: ratings_insert_participant solo validaba que el rater fuera
-- participante del job (employer_id o assigned_worker_id), pero nunca
-- verificaba que rated_id fuera realmente la contraparte del trabajo, ni
-- que el trabajo estuviera 'completado' (regla R4/R9 documentada en
-- docs/FLUJO-CONTRATACION.md pero no implementada en la policy). Esto
-- permitía insertar una fila en ratings con rated_id apuntando a
-- cualquier perfil arbitrario, y hacerlo en cualquier estado del job.
-- ------------------------------------------------------------
drop policy if exists "ratings_insert_participant" on public.ratings;
create policy "ratings_insert_participant"
  on public.ratings for insert
  with check (
    auth.uid() = rater_id
    and exists (
      select 1 from public.jobs
      where jobs.id = job_id
        and jobs.status = 'completado'
        and (
          (auth.uid() = jobs.employer_id and rated_id = jobs.assigned_worker_id)
          or (auth.uid() = jobs.assigned_worker_id and rated_id = jobs.employer_id)
        )
    )
  );
