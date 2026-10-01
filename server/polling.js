import {recordBroadcast} from './broadcast-history.js';
import {pool} from './db.js';
import {searchOfficialModels} from './model-search.js';
import {inspectRoomState} from './room-state.js';
import {ObservationBuffer,groupObservations} from './observation-buffer.js';
export function validatePolling(value){
 for(const key of ['trackedSeconds','generalSeconds'])if(!Number.isInteger(value[key])||value[key]<5||value[key]>3600)throw new Error('采集间隔必须为 5–3600 秒的整数');
 return {trackedSeconds:value.trackedSeconds,generalSeconds:value.generalSeconds};
}
let config={trackedSeconds:5,generalSeconds:60};
export const pollingState={running:false,lastFinished:null,error:null,count:0,failed:0};
export const getPolling=()=>({...config,historySeconds:60,tracked:pollingState});
export async function trackedSnapshot(model,{search=searchOfficialModels,inspect=inspectRoomState}={}){
 const [room,result]=await Promise.all([inspect(model),search(model.name).catch(()=>null)]);
 if(String(room.modelId)!==String(model.source_id))throw new Error('主播身份不匹配');
 const found=result?.models.find(m=>m.source_id===model.source_id&&m.name.toLowerCase()===model.name.toLowerCase());
 return {viewers:Number.isInteger(found?.viewers)?found.viewers:null,online:room.online,room_status:room.status,room_details:room};
}
export async function loadPolling(){const r=await pool.query("SELECT value FROM settings WHERE key='polling'");if(r.rows[0])config=validatePolling(r.rows[0].value);}
export async function savePolling(value){const next=validatePolling(value);await pool.query("INSERT INTO settings(key,value) VALUES('polling',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[next]);config=next;return getPolling();}
export const trackedInterval=(model,seconds)=>model.highlight_active?5:seconds;
const lastAttempts=new Map();
const history=new ObservationBuffer();let stopped=false;
export const recentTrackedObservations=(modelId,rows)=>history.recent(modelId,rows);
export function currentTrackedModel(model){const sample=history.current(model.id);if(!sample)return model;return {...model,viewers:sample.viewers??model.viewers,online:sample.online,room_status:sample.room_status,room_details:sample.room_details,growth:sample.growth,last_seen_at:sample.observed_at,fresh:Date.now()-+new Date(sample.observed_at)<=Math.max(20,config.trackedSeconds*3)*1000};}

async function persistTracked(modelId){
 const pending=history.pending(modelId);if(!pending.length)return;
 const db=await pool.connect();
 try{
  await db.query('BEGIN');const {rows:[model]}=await db.query('SELECT * FROM models WHERE id=$1 FOR UPDATE',[modelId]);
  if(!model||!model.favorite&&!model.monitored){await db.query('ROLLBACK');history.committed(modelId,pending.length);return;}
  for(const {sample,summary,samples} of groupObservations(pending)){
   if(sample.error){
    await db.query('INSERT INTO broadcast_observations(model_id,interval_seconds,error,observed_at) VALUES($1,$2,$3,$4)',[modelId,sample.interval_seconds,sample.error,sample.observed_at]);
    await db.query('UPDATE broadcast_sessions SET incomplete=true WHERE model_id=$1 AND ended_at IS NULL AND incomplete IS DISTINCT FROM true',[modelId]);
    continue;
   }
   await db.query('UPDATE models SET viewers=coalesce($2,viewers),online=$3,room_status=$4,growth=$5,last_seen_at=$7,room_details=$6 WHERE id=$1',[modelId,sample.viewers,sample.online,sample.room_status,sample.growth,sample.room_details,sample.observed_at]);
   if(sample.viewers!=null&&sample.online!==null)await db.query("INSERT INTO model_snapshots(model_id,viewers,online,scope,sampled_at) VALUES($1,$2,$3,'tracked',$4)",[modelId,sample.viewers,sample.online,sample.observed_at]);
   if(model.monitored)for(const row of samples)for(const rule of row.rules||[])await db.query('INSERT INTO events(model_id,title,detail,created_at) VALUES($1,$2,$3,$4)',[modelId,rule.name,`${model.name} · 当前 ${row.viewers} 人观看`,row.observed_at]);
   await recordBroadcast(db,modelId,sample,sample.interval_seconds,new Date(sample.observed_at),summary);
  }
  await db.query('COMMIT');history.committed(modelId,pending.length);
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function stopTracked(){stopped=true;while(pollingState.running)await new Promise(resolve=>setTimeout(resolve,25));for(const id of history.entries.keys())await persistTracked(id);}
export async function collectTracked(){
 if(pollingState.running||stopped)return;pollingState.running=true;pollingState.error=null;let count=0,failed=0;
 try{
  await pool.query("UPDATE broadcast_sessions s SET ended_at=last_seen,incomplete=true,end_reason='tracking_disabled' FROM models m WHERE s.model_id=m.id AND s.ended_at IS NULL AND NOT m.favorite AND NOT m.monitored");
  const result=await pool.query("SELECT m.*, EXISTS(SELECT 1 FROM highlight_settings h WHERE h.model_id=m.id AND (h.enabled OR h.config->>'goalNotify'='true')) AS highlight_active FROM models m WHERE favorite OR monitored");
  const ids=new Set(result.rows.map(m=>m.id));history.retain(ids);for(const id of lastAttempts.keys())if(!ids.has(id))lastAttempts.delete(id);
  const rules=(await pool.query('SELECT * FROM monitor_rules WHERE enabled=true')).rows;
  const rows=result.rows.filter(m=>Date.now()-(lastAttempts.get(m.id)||0)>=trackedInterval(m,config.trackedSeconds)*1000);let cursor=0;
  await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{while(cursor<rows.length&&!stopped){const model=rows[cursor++],interval=trackedInterval(model,config.trackedSeconds);lastAttempts.set(model.id,Date.now());try{
   if(history.pending(model.id).length>=120)await persistTracked(model.id);
   const found=await trackedSnapshot(model);
   const previous=currentTrackedModel(model);
   const hits=model.monitored&&previous.last_seen_at?rules.filter(rule=>{const threshold=Number(rule.condition.match(/≥\s*(\d+)/)?.[1]);return threshold>0&&previous.viewers<threshold&&found.viewers>=threshold;}):[];
   const sample={...found,growth:found.viewers!=null&&previous.last_seen_at&&previous.viewers>0?Math.round((found.viewers-previous.viewers)/previous.viewers*100):null,rules:hits};
   if(history.add(model.id,sample,interval,Date.now(),hits.length>0))await persistTracked(model.id);
   count++;
  }catch(e){if(history.add(model.id,{error:e.message.slice(0,500)},interval))await persistTracked(model.id).catch(()=>{});failed++;pollingState.error=`${model.name}：${e.message}`;}}}));
 }catch(e){pollingState.error=e.message;}finally{Object.assign(pollingState,{running:false,lastFinished:new Date().toISOString(),count,failed});}
}
