import {pool} from './db.js';
import {createPublicInfo} from './public-info.js';
import {profileSnapshot} from './insight-logic.js';
const info=createPublicInfo();let timer,inflight,stopped=true,lock;
export async function saveProfileSnapshot(db,model,profile,at=new Date()){
 const current=(await db.query('SELECT id,favorite,monitored FROM models WHERE id=$1 FOR UPDATE',[model.id])).rows[0];
 if(!current||!current.favorite&&!current.monitored)return null;
 const previous=(await db.query('SELECT data FROM profile_snapshots WHERE model_id=$1 ORDER BY id DESC LIMIT 1',[model.id])).rows[0]?.data;
 const {data,changes}=profileSnapshot(previous,profile);
 const row=(await db.query('INSERT INTO profile_snapshots(model_id,observed_at,data,changes) VALUES($1,$2,$3,$4) RETURNING id',[model.id,at,data,JSON.stringify(changes)])).rows[0];
 await db.query(`INSERT INTO profile_monitor_state(model_id,attempted_at,succeeded_at,error) VALUES($1,$2,$2,$3) ON CONFLICT(model_id) DO UPDATE SET succeeded_at=$2,error=$3`,[model.id,at,profile.unavailable?.length?'部分资料暂不可用：'+profile.unavailable.join('、'):null]);
 if(changes.length)await db.query(`INSERT INTO events(model_id,title,detail,kind,payload,created_at) VALUES($1,$2,$3,'profile',$4,$5)`,[model.id,model.name+' 更新了公开资料',changes.map(c=>c.label).join('、'),{snapshotId:row.id},at]);
 return {id:row.id,data,changes};
}
export function syncProfiles(){
 if(stopped)return Promise.resolve();if(inflight)return inflight;
 inflight=(async()=>{
  const {rows}=await pool.query(`SELECT m.* FROM models m LEFT JOIN profile_monitor_state p ON p.model_id=m.id WHERE (m.favorite OR m.monitored) AND (p.attempted_at IS NULL OR p.attempted_at<now()-interval '30 minutes') ORDER BY p.attempted_at NULLS FIRST,m.id LIMIT 20`);
  for(const model of rows){if(stopped)break;
   await pool.query(`INSERT INTO profile_monitor_state(model_id) VALUES($1) ON CONFLICT(model_id) DO UPDATE SET attempted_at=now()`,[model.id]);
   try{const profile=await info.profile(model),db=await pool.connect();try{await db.query('BEGIN');await saveProfileSnapshot(db,model,profile);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
   catch{await pool.query("UPDATE profile_monitor_state SET error='公开资料采集失败，保留上次结果' WHERE model_id=$1",[model.id]);}
  }
 })().catch(e=>console.error('资料变化采集:',e.message)).finally(()=>{inflight=null;});return inflight;
}
export async function startProfileMonitor(){lock=await pool.connect();if(!(await lock.query('SELECT pg_try_advisory_lock(73190515) AS locked')).rows[0].locked){lock.release();lock=null;return;}stopped=false;timer=setInterval(()=>void syncProfiles(),60000);void syncProfiles();}
export async function stopProfileMonitor(){stopped=true;clearInterval(timer);await inflight;if(lock){await lock.query('SELECT pg_advisory_unlock(73190515)');lock.release();lock=null;}}
