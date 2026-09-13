import {recordBroadcast} from './broadcast-history.js';
import {pool} from './db.js';
import {searchOfficialModels} from './model-search.js';
import {inspectRoomState} from './room-state.js';
export function validatePolling(value){
 for(const key of ['trackedSeconds','generalSeconds'])if(!Number.isInteger(value[key])||value[key]<5||value[key]>3600)throw new Error('采集间隔必须为 5–3600 秒的整数');
 return {trackedSeconds:value.trackedSeconds,generalSeconds:value.generalSeconds};
}
let config={trackedSeconds:5,generalSeconds:60};
export const pollingState={running:false,lastFinished:null,error:null,count:0,failed:0};
export const getPolling=()=>({...config,tracked:pollingState});
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
export async function collectTracked(){
 if(pollingState.running)return;pollingState.running=true;pollingState.error=null;let count=0,failed=0;
 try{
  await pool.query("UPDATE broadcast_sessions s SET ended_at=last_seen,incomplete=true,end_reason='tracking_disabled' FROM models m WHERE s.model_id=m.id AND s.ended_at IS NULL AND NOT m.favorite AND NOT m.monitored");
  const result=await pool.query("SELECT m.*, EXISTS(SELECT 1 FROM highlight_settings h WHERE h.model_id=m.id AND (h.enabled OR h.config->>'goalNotify'='true')) AS highlight_active FROM models m WHERE favorite OR monitored");
  const ids=new Set(result.rows.map(m=>m.id));for(const id of lastAttempts.keys())if(!ids.has(id))lastAttempts.delete(id);
  const rows=result.rows.filter(m=>Date.now()-(lastAttempts.get(m.id)||0)>=trackedInterval(m,config.trackedSeconds)*1000);let cursor=0;
  await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{while(cursor<rows.length){const model=rows[cursor++],interval=trackedInterval(model,config.trackedSeconds);lastAttempts.set(model.id,Date.now());try{
   const found=await trackedSnapshot(model);
   const db=await pool.connect();try{await db.query('BEGIN');const {rows:[old]}=await db.query('SELECT * FROM models WHERE id=$1 FOR UPDATE',[model.id]);
    if(!old.favorite&&!old.monitored){await db.query('ROLLBACK');continue;}
    const growth=found.viewers!=null&&old.last_seen_at&&old.viewers>0?Math.round((found.viewers-old.viewers)/old.viewers*100):null;
    await db.query('UPDATE models SET viewers=coalesce($2,viewers),online=$3,room_status=$4,growth=$5,last_seen_at=now(),room_details=$6 WHERE id=$1',[model.id,found.viewers,found.online,found.room_status,growth,found.room_details]);
    if(found.viewers!=null&&found.online!==null)await db.query("INSERT INTO model_snapshots(model_id,viewers,online,scope) VALUES($1,$2,$3,'tracked')",[model.id,found.viewers,found.online]);
    if(old.monitored&&old.last_seen_at){const rules=(await db.query('SELECT * FROM monitor_rules WHERE enabled=true')).rows;for(const rule of rules){const threshold=Number(rule.condition.match(/≥\s*(\d+)/)?.[1]);if((threshold>0&&old.viewers<threshold&&found.viewers>=threshold))await db.query('INSERT INTO events(model_id,title,detail) VALUES($1,$2,$3)',[model.id,rule.name,`${model.name} · 当前 ${found.viewers} 人观看`]);}}
    await recordBroadcast(db,model.id,found,interval);
    await db.query('COMMIT');count++;
   }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }catch(e){await pool.query('INSERT INTO broadcast_observations(model_id,interval_seconds,error) VALUES($1,$2,$3)',[model.id,interval,e.message.slice(0,500)]).catch(()=>{});await pool.query('UPDATE broadcast_sessions SET incomplete=true WHERE model_id=$1 AND ended_at IS NULL',[model.id]).catch(()=>{});failed++;pollingState.error=`${model.name}：${e.message}`;}}}));
 }catch(e){pollingState.error=e.message;}finally{Object.assign(pollingState,{running:false,lastFinished:new Date().toISOString(),count,failed});}
}
