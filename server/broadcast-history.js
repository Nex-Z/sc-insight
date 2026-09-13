export const broadcastSchema=`
CREATE TABLE IF NOT EXISTS broadcast_sessions (
 id BIGSERIAL PRIMARY KEY,model_id INTEGER NOT NULL REFERENCES models(id),
 first_seen TIMESTAMPTZ NOT NULL,last_seen TIMESTAMPTZ NOT NULL,ended_at TIMESTAMPTZ,
 start_known BOOLEAN NOT NULL, end_known BOOLEAN NOT NULL DEFAULT false,
 incomplete BOOLEAN NOT NULL DEFAULT false, end_reason TEXT,
 observed_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,samples INTEGER NOT NULL DEFAULT 0,
 viewer_sum DOUBLE PRECISION NOT NULL DEFAULT 0,peak_viewers INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX IF NOT EXISTS broadcast_active_model ON broadcast_sessions(model_id) WHERE ended_at IS NULL;
CREATE TABLE IF NOT EXISTS broadcast_observations (
 id BIGSERIAL PRIMARY KEY,model_id INTEGER NOT NULL REFERENCES models(id),session_id BIGINT REFERENCES broadcast_sessions(id),
 observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),online BOOLEAN,room_status TEXT,viewers INTEGER,
 interval_seconds INTEGER NOT NULL,error TEXT,source TEXT NOT NULL DEFAULT 'official-search');
CREATE INDEX IF NOT EXISTS broadcast_observation_model_time ON broadcast_observations(model_id,observed_at DESC);
CREATE TABLE IF NOT EXISTS broadcast_intervals (
 id BIGSERIAL PRIMARY KEY,model_id INTEGER NOT NULL REFERENCES models(id),session_id BIGINT NOT NULL REFERENCES broadcast_sessions(id),
 started_at TIMESTAMPTZ NOT NULL,ended_at TIMESTAMPTZ NOT NULL,viewer_average DOUBLE PRECISION NOT NULL);
CREATE INDEX IF NOT EXISTS broadcast_interval_model_time ON broadcast_intervals(model_id,started_at);
ALTER TABLE models ADD COLUMN IF NOT EXISTS room_details JSONB;
ALTER TABLE broadcast_observations ADD COLUMN IF NOT EXISTS room_details JSONB;
ALTER TABLE broadcast_observations ALTER COLUMN viewers DROP NOT NULL;
ALTER TABLE broadcast_intervals ALTER COLUMN viewer_average DROP NOT NULL;
ALTER TABLE broadcast_sessions ADD COLUMN IF NOT EXISTS viewer_samples INTEGER;
UPDATE broadcast_sessions SET viewer_samples=samples WHERE viewer_samples IS NULL;
`;
export function classifyObservation(previous,current,intervalSeconds){
 const seconds=previous?(new Date(current.time)-new Date(previous.observed_at))/1000:0;
 const continuous=!!previous&&seconds>=0&&seconds<=Math.max(20,intervalSeconds*3);
 return {seconds:continuous&&previous.online&&current.online?seconds:0,gap:!!previous&&!continuous,startKnown:continuous&&previous.online===false&&current.online===true};
}
// Caller holds the model row lock and commits the sample and session together.
export async function recordBroadcast(db,modelId,sample,intervalSeconds,time=new Date()){
 const previous=(await db.query('SELECT * FROM broadcast_observations WHERE model_id=$1 AND error IS NULL ORDER BY observed_at DESC,id DESC LIMIT 1',[modelId])).rows[0];
 let active=(await db.query('SELECT * FROM broadcast_sessions WHERE model_id=$1 AND ended_at IS NULL',[modelId])).rows[0];
 const decision=classifyObservation(previous,{time,online:sample.online},intervalSeconds);
 if(previous){const failed=await db.query('SELECT 1 FROM broadcast_observations WHERE model_id=$1 AND error IS NOT NULL AND observed_at>$2 LIMIT 1',[modelId,previous.observed_at]);if(failed.rowCount){decision.seconds=0;decision.startKnown=false;}}
 if(active&&decision.gap){await db.query("UPDATE broadcast_sessions SET ended_at=last_seen,end_reason='observation_gap',incomplete=true WHERE id=$1",[active.id]);active=null;}
 if(sample.online&&!active){active=(await db.query('INSERT INTO broadcast_sessions(model_id,first_seen,last_seen,start_known,incomplete) VALUES($1,$2,$2,$3,$4) RETURNING *',[modelId,time,decision.startKnown,!decision.startKnown])).rows[0];}
 if(active&&sample.online){
  const seconds=previous?.session_id===active.id?decision.seconds:0;
  await db.query('UPDATE broadcast_sessions SET last_seen=$2,observed_seconds=observed_seconds+$3,samples=samples+1,viewer_samples=coalesce(viewer_samples,0)+CASE WHEN $4::double precision IS NULL THEN 0 ELSE 1 END,viewer_sum=viewer_sum+coalesce($4,0),peak_viewers=greatest(peak_viewers,$4) WHERE id=$1',[active.id,time,seconds,sample.viewers]);
  if(seconds>0)await db.query('INSERT INTO broadcast_intervals(model_id,session_id,started_at,ended_at,viewer_average,room_status) VALUES($1,$2,$3,$4,$5,$6)',[modelId,active.id,previous.observed_at,time,previous.viewers!=null&&sample.viewers!=null?(previous.viewers+sample.viewers)/2:null,previous.room_status===sample.room_status?sample.room_status:null]);
 }else if(active&&sample.online===false){await db.query("UPDATE broadcast_sessions SET ended_at=$2,end_known=true,end_reason='offline_observed' WHERE id=$1",[active.id,time]);}
 else if(active){await db.query('UPDATE broadcast_sessions SET incomplete=true WHERE id=$1',[active.id]);}
 await db.query('INSERT INTO broadcast_observations(model_id,session_id,observed_at,online,room_status,viewers,interval_seconds,room_details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[modelId,active?.id||null,time,sample.online,sample.room_status,sample.viewers,intervalSeconds,sample.room_details||null]);
}
