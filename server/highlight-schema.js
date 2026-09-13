export const highlightSchema=`
CREATE TABLE IF NOT EXISTS highlight_settings (
 model_id INTEGER PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
 enabled BOOLEAN NOT NULL DEFAULT false, config JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS highlights (
 id BIGSERIAL PRIMARY KEY, model_id INTEGER NOT NULL REFERENCES models(id),
 triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_trigger_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ, reasons JSONB NOT NULL DEFAULT '[]',
 status TEXT NOT NULL DEFAULT '录制中', directory TEXT NOT NULL, filename TEXT NOT NULL,
 duration_seconds DOUBLE PRECISION NOT NULL DEFAULT 0, bytes BIGINT NOT NULL DEFAULT 0, error TEXT);
CREATE INDEX IF NOT EXISTS highlights_model_time ON highlights(model_id,id DESC);
ALTER TABLE highlights ADD COLUMN IF NOT EXISTS cache_directory TEXT;
ALTER TABLE highlights ADD COLUMN IF NOT EXISTS end_reason TEXT;
ALTER TABLE highlights ADD COLUMN IF NOT EXISTS end_room_status TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS one_active_highlight_per_model ON highlights(model_id) WHERE status IN ('录制中','归档中');
CREATE TABLE IF NOT EXISTS goal_monitor_state (
 model_id INTEGER PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
 state JSONB NOT NULL DEFAULT '{}',error TEXT,updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS goal_signals (
 id BIGSERIAL PRIMARY KEY,model_id INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
 cycle BIGINT NOT NULL,kind TEXT NOT NULL,payload JSONB NOT NULL,observed_at TIMESTAMPTZ NOT NULL,
 highlight_id BIGINT REFERENCES highlights(id) ON DELETE SET NULL,UNIQUE(model_id,cycle,kind));
CREATE INDEX IF NOT EXISTS goal_signal_time ON goal_signals(model_id,observed_at);
`;
