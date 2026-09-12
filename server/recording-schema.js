export async function recordingSchema(db) {
 await db.query(`CREATE TABLE IF NOT EXISTS recording_sources (
 model_id INTEGER PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
 url TEXT NOT NULL, auto_record BOOLEAN NOT NULL DEFAULT false,
 max_seconds INTEGER NOT NULL DEFAULT 3600 CHECK(max_seconds BETWEEN 5 AND 21600),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
 ALTER TABLE recording_sources ALTER COLUMN url DROP NOT NULL;
 ALTER TABLE recording_sources ADD COLUMN IF NOT EXISTS until_offline BOOLEAN NOT NULL DEFAULT false;
 ALTER TABLE recordings ADD COLUMN IF NOT EXISTS until_offline BOOLEAN NOT NULL DEFAULT false;
 ALTER TABLE recordings ADD COLUMN IF NOT EXISTS directory TEXT;
 ALTER TABLE recordings ADD COLUMN IF NOT EXISTS bytes BIGINT NOT NULL DEFAULT 0;
 ALTER TABLE recordings ADD COLUMN IF NOT EXISTS duration_seconds DOUBLE PRECISION NOT NULL DEFAULT 0;
 ALTER TABLE recordings ADD COLUMN IF NOT EXISTS max_seconds INTEGER NOT NULL DEFAULT 3600;
 ALTER TABLE recordings ADD COLUMN IF NOT EXISTS source_url TEXT;
 ALTER TABLE recordings ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
 ALTER TABLE recordings ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
 ALTER TABLE recordings ADD COLUMN IF NOT EXISTS error TEXT;
 ALTER TABLE recordings ADD COLUMN IF NOT EXISTS worker_pid INTEGER;
 CREATE UNIQUE INDEX IF NOT EXISTS one_active_recording_per_model ON recordings(model_id)
 WHERE status IN ('排队中','连接中','录制中','归档中');`);
}
