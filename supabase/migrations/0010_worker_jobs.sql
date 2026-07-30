-- Add preseleccionado shortlist status
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'preseleccionado' AFTER 'pendiente';

-- Saved jobs table (worker bookmarks)
CREATE TABLE IF NOT EXISTS saved_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id      uuid NOT NULL REFERENCES jobs(id)       ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worker_id, job_id)
);

ALTER TABLE saved_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers can manage their saved jobs"
  ON saved_jobs
  FOR ALL
  USING  (auth.uid() = worker_id)
  WITH CHECK (auth.uid() = worker_id);

CREATE INDEX IF NOT EXISTS idx_saved_jobs_worker ON saved_jobs(worker_id);
CREATE INDEX IF NOT EXISTS idx_saved_jobs_job    ON saved_jobs(job_id);
