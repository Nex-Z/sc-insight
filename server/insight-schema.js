export const insightSchema=`
ALTER TABLE events ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'rule';
ALTER TABLE events ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}';
ALTER TABLE events ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS events_unread ON events(id DESC) WHERE read_at IS NULL;
CREATE TABLE IF NOT EXISTS profile_snapshots (
 id BIGSERIAL PRIMARY KEY,model_id INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
 observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),data JSONB NOT NULL,changes JSONB NOT NULL DEFAULT '[]');
CREATE INDEX IF NOT EXISTS profile_snapshot_model ON profile_snapshots(model_id,id DESC);
CREATE TABLE IF NOT EXISTS profile_monitor_state (
 model_id INTEGER PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
 attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),succeeded_at TIMESTAMPTZ,error TEXT);
CREATE TABLE IF NOT EXISTS content_metadata (
 kind TEXT NOT NULL CHECK(kind IN ('recording','highlight')),item_id BIGINT NOT NULL,
 title TEXT NOT NULL DEFAULT '',tags JSONB NOT NULL DEFAULT '[]',favorite BOOLEAN NOT NULL DEFAULT false,
 watched BOOLEAN NOT NULL DEFAULT false,note TEXT NOT NULL DEFAULT '',marks JSONB NOT NULL DEFAULT '[]',
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(kind,item_id));
CREATE OR REPLACE FUNCTION insight_highlight_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO events(model_id,title,detail,kind,payload,created_at)
 SELECT NEW.model_id,m.name || ' 出现高光',coalesce((SELECT string_agg(r->>'text',' · ') FROM jsonb_array_elements(NEW.reasons) r),'正在保留片段'),
 'highlight',jsonb_build_object('highlightId',NEW.id::text),NEW.triggered_at FROM models m WHERE m.id=NEW.model_id;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS insight_highlight_created ON highlights;
CREATE TRIGGER insight_highlight_created AFTER INSERT ON highlights FOR EACH ROW EXECUTE FUNCTION insight_highlight_event();
`;
