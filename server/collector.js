import {rememberSnapshot} from './snapshot-hints.js';
import {pool} from './db.js';
export function normalizeModels(payload) {
 if (!Array.isArray(payload.blocks)) throw new Error('上游响应结构变化：缺少 blocks');
 const unique=new Map();
 for(const block of payload.blocks) for(const m of block.models||[]) {
  if(!m.id || typeof m.username!=='string' || !Number.isInteger(m.viewersCount) || m.viewersCount<0) continue;
  unique.set(String(m.id),{sourceId:String(m.id),snapshot_url:rememberSnapshot(m),name:m.username,country:m.country||'未知',viewers:m.viewersCount,online:m.isOnline===true || m.isLive===true || m.status==='public',status:m.status||'unknown'});
 }
 if(!unique.size) throw new Error('上游未返回有效主播数据，保留上次采样');
 return [...unique.values()];
}
let running=false;
export async function collect() {
 if(running) return {busy:true};
 running=true;let runId;
 try {
  runId=(await pool.query("INSERT INTO collection_runs(status) VALUES('running') RETURNING id")).rows[0].id;
  const response=await fetch('https://stripchat.com/api/front/v2/models?limit=24&offset=0&primaryTag=girls',{signal:AbortSignal.timeout(25000),headers:{Accept:'application/json'}});
  if(!response.ok) throw new Error(`上游 HTTP ${response.status}`);
  const models=normalizeModels(await response.json());
  const db=await pool.connect();
  try {
   await db.query('BEGIN');
   const rules=(await db.query('SELECT * FROM monitor_rules WHERE enabled=true')).rows;
   for(const m of models) {
    const old=(await db.query('SELECT * FROM models WHERE source_id=$1',[m.sourceId])).rows[0];
    if(old&&(old.favorite||old.monitored))continue;
    const growth=old && old.viewers>0 ? Math.round((m.viewers-old.viewers)/old.viewers*100) : null;
    const {rows:[saved]}=await db.query(`INSERT INTO models(name,country,language,viewers,growth,online,color,source_id,room_status,last_seen_at)
     VALUES($1,$2,'未知',$3,$4,$5,'#8a6b77',$6,$7,now()) ON CONFLICT(source_id) DO UPDATE SET name=excluded.name,country=excluded.country,viewers=excluded.viewers,growth=excluded.growth,online=excluded.online,room_status=excluded.room_status,last_seen_at=now() RETURNING id,monitored`,[m.name,m.country,m.viewers,growth,m.online,m.sourceId,m.status]);
    await db.query('INSERT INTO model_snapshots(model_id,viewers,online) VALUES($1,$2,$3)',[saved.id,m.viewers,m.online]);
    if(old && saved.monitored) for(const rule of rules) {
     const threshold=Number(rule.condition.match(/≥\s*(\d+)/)?.[1]);
     const hit=(rule.condition==='主播上线时' && !old.online && m.online) || (rule.condition.startsWith('观众数 ≥') && threshold>0 && old.viewers<threshold && m.viewers>=threshold);
     if(hit) await db.query('INSERT INTO events(model_id,title,detail) VALUES($1,$2,$3)',[saved.id,rule.name,`${m.name} · 当前 ${m.viewers} 人观看`]);
    }
   }
   await db.query("UPDATE collection_runs SET status='success',count=$2,finished_at=now() WHERE id=$1",[runId,models.length]);
   await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  return {count:models.length};
 }catch(e){if(runId)await pool.query("UPDATE collection_runs SET status='error',error=$2,finished_at=now() WHERE id=$1",[runId,e.message]);throw e;}finally{running=false;}
}
