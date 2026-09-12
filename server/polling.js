import {recordBroadcast} from './broadcast-history.js';
import {pool} from './db.js';
import {searchOfficialModels} from './model-search.js';
import {inspectPublicRoom} from './public-source.js';
export function validatePolling(value){
 for(const key of ['trackedSeconds','generalSeconds'])if(!Number.isInteger(value[key])||value[key]<5||value[key]>3600)throw new Error('采集间隔必须为 5–3600 秒的整数');
 return {trackedSeconds:value.trackedSeconds,generalSeconds:value.generalSeconds};
}
let config={trackedSeconds:5,generalSeconds:60};
export const pollingState={running:false,lastFinished:null,error:null,count:0,failed:0};
export const getPolling=()=>({...config,tracked:pollingState});
export async function trackedSnapshot(model,{search=searchOfficialModels,inspect=inspectPublicRoom}={}){
 const result=await search(model.name);const found=result.models.find(m=>m.source_id===model.source_id&&m.name.toLowerCase()===model.name.toLowerCase());if(!found)throw new Error('官网未返回对应身份，保留上次数据');
 if(!found.fresh||!['public','private','p2p','groupShow','away','offline','idle'].includes(found.room_status)){const room=await inspect(model.name);if(String(room.modelId)!==model.source_id)throw new Error('主播身份不匹配');found.online=!['offline','idle'].includes(room.status);found.room_status=room.status;}
 found.online=!['offline','idle'].includes(found.room_status);
 return found;
}
export async function loadPolling(){const r=await pool.query("SELECT value FROM settings WHERE key='polling'");if(r.rows[0])config=validatePolling(r.rows[0].value);}
export async function savePolling(value){const next=validatePolling(value);await pool.query("INSERT INTO settings(key,value) VALUES('polling',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[next]);config=next;return getPolling();}
export async function collectTracked(){
 if(pollingState.running)return;pollingState.running=true;pollingState.error=null;let count=0,failed=0;
 try{
  await pool.query("UPDATE broadcast_sessions s SET ended_at=last_seen,incomplete=true,end_reason='tracking_disabled' FROM models m WHERE s.model_id=m.id AND s.ended_at IS NULL AND NOT m.favorite AND NOT m.monitored");
  const {rows}=await pool.query('SELECT * FROM models WHERE favorite OR monitored');let cursor=0;
  await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{while(cursor<rows.length){const model=rows[cursor++];try{
   const found=await trackedSnapshot(model);
   const db=await pool.connect();try{await db.query('BEGIN');const {rows:[old]}=await db.query('SELECT * FROM models WHERE id=$1 FOR UPDATE',[model.id]);
    if(!old.favorite&&!old.monitored){await db.query('ROLLBACK');continue;}
    const growth=old.last_seen_at&&old.viewers>0?Math.round((found.viewers-old.viewers)/old.viewers*100):null;
    await db.query('UPDATE models SET viewers=$2,online=$3,room_status=$4,growth=$5,last_seen_at=now() WHERE id=$1',[model.id,found.viewers,found.online,found.room_status,growth]);
    await db.query("INSERT INTO model_snapshots(model_id,viewers,online,scope) VALUES($1,$2,$3,'tracked')",[model.id,found.viewers,found.online]);
    if(old.monitored&&old.last_seen_at){const rules=(await db.query('SELECT * FROM monitor_rules WHERE enabled=true')).rows;for(const rule of rules){const threshold=Number(rule.condition.match(/≥\s*(\d+)/)?.[1]);if((rule.condition==='主播上线时'&&!old.online&&found.online)||(threshold>0&&old.viewers<threshold&&found.viewers>=threshold))await db.query('INSERT INTO events(model_id,title,detail) VALUES($1,$2,$3)',[model.id,rule.name,`${model.name} · 当前 ${found.viewers} 人观看`]);}}
    await recordBroadcast(db,model.id,found,config.trackedSeconds);
    await db.query('COMMIT');count++;
   }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }catch(e){await pool.query('INSERT INTO broadcast_observations(model_id,interval_seconds,error) VALUES($1,$2,$3)',[model.id,config.trackedSeconds,e.message.slice(0,500)]).catch(()=>{});await pool.query('UPDATE broadcast_sessions SET incomplete=true WHERE model_id=$1 AND ended_at IS NULL',[model.id]).catch(()=>{});failed++;pollingState.error=`${model.name}：${e.message}`;}}}));
 }catch(e){pollingState.error=e.message;}finally{Object.assign(pollingState,{running:false,lastFinished:new Date().toISOString(),count,failed});}
}
