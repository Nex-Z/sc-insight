import {pool} from './db.js';
import {createPublicInfo} from './public-info.js';
import {observeGoal} from './goal-detection.js';
import {validateHighlightSettings} from './highlight-detection.js';
import {goalCheckpoint,goalInterval} from './goal-checkpoint.js';
const info=createPublicInfo();let timer,inflight,stopped=true,lock;
const observations=new Map(),attempts=new Map();
export function currentGoalObservation(modelId){return observations.get(modelId);}
export async function saveGoalObservation(db,model,goal,now=Date.now(),prepared){
 const config=validateHighlightSettings(model.config||{});
 await db.query('INSERT INTO goal_monitor_state(model_id) VALUES($1) ON CONFLICT DO NOTHING',[model.id]);
 const previous=(await db.query('SELECT state FROM goal_monitor_state WHERE model_id=$1 FOR UPDATE',[model.id])).rows[0].state;
 const result=prepared||observeGoal(previous,goal,now,config.goalNearPercent);
 await db.query('UPDATE goal_monitor_state SET state=$2,error=NULL,updated_at=$3 WHERE model_id=$1',[model.id,result.state,new Date(now)]);
 for(const signal of result.signals){
  const inserted=await db.query('INSERT INTO goal_signals(model_id,cycle,kind,payload,observed_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id',[model.id,signal.cycle,signal.kind,signal,new Date(now)]);
  if(inserted.rowCount&&(config.goalNotify||signal.kind==='goalComplete'&&(model.favorite||model.monitored)))await db.query('INSERT INTO events(model_id,title,detail,kind,payload,created_at) VALUES($1,$2,$3,$4,$5,$6)',[model.id,model.name+(signal.kind==='goalNear'?' 目标即将完成':' 目标已完成'),signal.text,signal.kind,{goalSignalId:inserted.rows[0].id},new Date(now)]);
 }
 return result;
}
export function syncGoalMonitor(){
 if(stopped)return Promise.resolve();if(inflight)return inflight;
 inflight=(async()=>{
  const tracked=await pool.query("SELECT m.*,h.config FROM models m LEFT JOIN highlight_settings h ON h.model_id=m.id WHERE m.favorite OR m.monitored ORDER BY m.id");
  const ids=new Set(tracked.rows.map(m=>m.id));for(const id of observations.keys())if(!ids.has(id))observations.delete(id);for(const id of attempts.keys())if(!ids.has(id))attempts.delete(id);
  const rows=tracked.rows.filter(model=>{const last=attempts.get(model.id);return !last||last.online!==model.online||Date.now()-last.at>=goalInterval(model);});
  let cursor=0;await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{while(cursor<rows.length&&!stopped){const model=rows[cursor++];
   attempts.set(model.id,{at:Date.now(),online:model.online});
   try{
    const room=await info.goal(model),now=Date.now();let previous=observations.get(model.id);
    if(!previous?.state){const saved=(await pool.query('SELECT state,error,updated_at FROM goal_monitor_state WHERE model_id=$1',[model.id])).rows[0];if(saved)previous={state:saved.error?{...saved.state,available:false}:saved.state,error:saved.error,savedState:saved.state,savedAt:new Date(saved.updated_at).getTime()};else previous=null;}
    const {result,persist}=goalCheckpoint(previous,room.goal,now,validateHighlightSettings(model.config||{}).goalNearPercent);
    if(persist){const db=await pool.connect();try{await db.query('BEGIN');await saveGoalObservation(db,model,room.goal,now,result);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
    observations.set(model.id,{state:result.state,error:null,savedState:persist?result.state:previous.savedState,savedAt:persist?now:previous.savedAt});
   }catch{
    const previous=observations.get(model.id);observations.set(model.id,{...previous,state:previous?.state?{...previous.state,available:false,at:Date.now()}:undefined,error:'目标数据暂不可用'});
    await pool.query("INSERT INTO goal_monitor_state(model_id,error) VALUES($1,'目标数据暂不可用') ON CONFLICT(model_id) DO UPDATE SET error=excluded.error WHERE goal_monitor_state.error IS DISTINCT FROM excluded.error",[model.id]);
   }
  }}));
 })().catch(e=>console.error('目标监控:',e.message)).finally(()=>{inflight=null;});return inflight;
}
export async function startGoalMonitor(){
 lock=await pool.connect();if(!(await lock.query('SELECT pg_try_advisory_lock(73190514) AS locked')).rows[0].locked){lock.release();lock=null;return;}
 stopped=false;timer=setInterval(()=>void syncGoalMonitor(),5000);void syncGoalMonitor();
}
export async function stopGoalMonitor(){stopped=true;clearInterval(timer);await inflight;if(lock){await lock.query('SELECT pg_advisory_unlock(73190514)');lock.release();lock=null;}}
