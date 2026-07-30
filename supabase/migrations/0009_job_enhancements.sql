-- ─── 0009 Job Enhancements ────────────────────────────────────────────────────
-- Adds 'borrador' job status, new job columns for the publishing wizard,
-- job_images table, and the job-images storage bucket.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Extend job_status enum with 'borrador' (draft)
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'borrador';

-- 2. New columns on jobs
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS work_date date,
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS estimated_duration text,
  ADD COLUMN IF NOT EXISTS urgency text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS requirements text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_urgency_check'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_urgency_check CHECK (urgency IN ('normal', 'urgente'));
  END IF;
END $$;

-- 3. job_images table
CREATE TABLE IF NOT EXISTS job_images (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  storage_path  text        NOT NULL,
  public_url    text        NOT NULL,
  display_order integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE job_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_images_select_public"   ON job_images;
DROP POLICY IF EXISTS "job_images_insert_employer" ON job_images;
DROP POLICY IF EXISTS "job_images_delete_employer" ON job_images;

CREATE POLICY "job_images_select_public" ON job_images
  FOR SELECT USING (true);

CREATE POLICY "job_images_insert_employer" ON job_images
  FOR INSERT WITH CHECK (
    auth.uid() = (SELECT employer_id FROM jobs WHERE id = job_id)
  );

CREATE POLICY "job_images_delete_employer" ON job_images
  FOR DELETE USING (
    auth.uid() = (SELECT employer_id FROM jobs WHERE id = job_id)
  );

-- 4. Storage bucket for job images (public read, auth upload)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-images',
  'job-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "job_images_storage_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "job_images_storage_auth_upload"  ON storage.objects;
DROP POLICY IF EXISTS "job_images_storage_auth_delete"  ON storage.objects;

CREATE POLICY "job_images_storage_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'job-images');

CREATE POLICY "job_images_storage_auth_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'job-images' AND auth.uid() IS NOT NULL
  );

CREATE POLICY "job_images_storage_auth_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'job-images' AND auth.uid() IS NOT NULL
  );
