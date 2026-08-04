-- ============================================================
-- CHAMBY — Perfil Profesional: cierra 2 huecos de RLS (auditoría final)
--
-- Ambos heredados sin corregir al portar 0010 desde la rama del PR #15
-- (docs/): "photos_update_own" y "stats_update_own"/"stats_insert_own"
-- son policies UPDATE/INSERT con USING pero sin WITH CHECK ni
-- restricción de columna — el mismo patrón de V1-V4 (Sprint de
-- Seguridad, ver 0007-0009).
-- ============================================================

-- ------------------------------------------------------------
-- profile_photos: solo is_primary/display_order deben ser escribibles
-- tras el INSERT (son las únicas columnas que tocan setPrimaryPhoto()
-- y reorderPhotos()). Sin esta restricción, un usuario autenticado
-- podía reescribir storage_path/public_url de una fila PROPIA para
-- apuntar al archivo de OTRO usuario (público, extraíble de su
-- public_url visible) y luego eliminarlo vía deleteProfilePhoto()
-- — que usa el cliente admin de Storage, sin RLS — borrando el
-- archivo de la víctima. profile_id también queda protegido (no debe
-- reasignarse jamás).
-- ------------------------------------------------------------
revoke update on public.profile_photos from authenticated;
grant update (is_primary, display_order) on public.profile_photos to authenticated;

-- ------------------------------------------------------------
-- profile_stats: badges (identity_verified, ruc_active,
-- certified_professional, top_profile) representa una verificación
-- calculada por el propio sistema tras revisar documentos reales.
-- stats_insert_own/stats_update_own sin restricción de valores
-- permitían que cualquier usuario escribiera directamente su propia
-- fila con badges/completion_percentage/trust_score arbitrarios —
-- autoasignarse "Identidad verificada" o "Perfil destacado" sin haber
-- pasado ninguna revisión real. Se revoca INSERT/UPDATE directo del
-- cliente; solo computeAndSaveProfileStats() (con el cliente admin,
-- sin RLS) puede escribir esta tabla. El usuario conserva solo
-- lectura de su propia fila (stats_select_own, sin cambios).
-- ------------------------------------------------------------
revoke insert, update on public.profile_stats from authenticated;
drop policy if exists "stats_insert_own" on public.profile_stats;
drop policy if exists "stats_update_own" on public.profile_stats;
