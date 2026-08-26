-- ============================================================
-- CHAMBY — Endurece RLS de conversation_read_cursors (Fase C4-G8.2)
--
-- Hallazgo H5 (auditoría C4-G8): "cursors_insert_own"/"cursors_update_own"
-- solo exigían profile_id = auth.uid(), sin comprobar que ese usuario
-- participa realmente en la conversación — cualquier autenticado podía
-- crear/actualizar un cursor propio para una conversación ajena (sin fuga
-- de contenido, porque la política SELECT ya era correcta, pero sí un
-- registro que no debería poder existir).
--
-- Cambio mínimo: agregar la misma comprobación de participación que ya
-- usan "messages_insert_participant" (0003_chat_extensions.sql) y
-- "cursors_select_participant" (misma migración) — ningún patrón nuevo.
--
-- NO se toca la política SELECT ("cursors_select_participant"), ya
-- correcta y explícitamente fuera de alcance. NO se tocan RLS de
-- conversations ni de messages.
-- ============================================================

drop policy if exists "cursors_insert_own" on public.conversation_read_cursors;
create policy "cursors_insert_own"
  on public.conversation_read_cursors for insert
  with check (
    profile_id = auth.uid()
    and conversation_id in (
      select id from public.conversations
      where employer_id = auth.uid() or worker_id = auth.uid()
    )
  );

drop policy if exists "cursors_update_own" on public.conversation_read_cursors;
create policy "cursors_update_own"
  on public.conversation_read_cursors for update
  using (
    profile_id = auth.uid()
    and conversation_id in (
      select id from public.conversations
      where employer_id = auth.uid() or worker_id = auth.uid()
    )
  );
