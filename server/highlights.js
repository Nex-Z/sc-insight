import {getHighlightLimit,loadHighlightCapacity,idleHighlightsToRelease} from './highlight-capacity.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pool} from './db.js';
import {getStorage} from './storage.js';
import {resolveModelInput} from './model-source.js';
import {redact,safeFile,probe} from './media.js';
import {workerState} from './recorder.js';
import {highlightSchema} from './highlight-schema.js';
import {detectHighlight,validateHighlightSettings} from './highlight-detection.js';
import {startBuffer,readBuffer,pruneBuffer,stopBuffer,exportBuffer,cleanBuffer} from './highlight-buffer.js';
import {mergeHighlightWindow} from './goal-detection.js';
import {recordingInterruption} from '../src/room-state.js';
import {inspectRoomState} from './room-state.js';

const jobs=new Map(),states=new Map(),retry=new Map();let timer,lock,inflight,stopped=true;
export function highlightCapacity(){return {concurrency:getHighlightLimit(),active:jobs.size,waiting:[...states.values()].filter(s=>s.waiting).length};}
export function highlightState(id){return states.get(Number(id))||{status:'等待公开直播'};}
export async function archiveHighlight(job,error=null){
 const h=job.highlight;if(!h)return;
 job.retainBuffer=true;
 await pool.query("UPDATE highlights SET status='归档中' WHERE id=$1",[h.id]);
 try{
  const media=await exportBuffer(job.buffer,{start:h.start,end:h.end,output:safeFile(h)});
  const interrupted=error||h.interruption||null;
  await pool.query('UPDATE highlights SET status=$2,started_at=$3,finished_at=$4,duration_seconds=$5,bytes=$6,error=$7 WHERE id=$1',[h.id,interrupted?'已中断':'已完成',new Date(media.start),new Date(media.end),media.duration,media.bytes,interrupted]);
  job.recordedThrough=media.end;
  job.retainBuffer=false;
 }catch(e){await pool.query("UPDATE highlights SET status='失败',finished_at=now(),error=$2 WHERE id=$1",[h.id,redact(e.message)]);}
 job.highlight=null;
}
async function stopJob(id,reason,ending){
 const job=jobs.get(id);if(!job)return;
 if(job.highlight&&ending)await pool.query('UPDATE highlights SET end_reason=$2,end_room_status=$3 WHERE id=$1',[job.highlight.id,ending.code,ending.status||null]);
 await stopBuffer(job.buffer);job.input.close();
 await archiveHighlight(job,reason);
 if(!job.retainBuffer)await cleanBuffer(job.buffer);jobs.delete(id);
}
export async function captureHighlight(job,reasons,now){
 if(job.highlight){
  const h=job.highlight=mergeHighlightWindow(job.highlight,reasons,now);
  await pool.query('UPDATE highlights SET last_trigger_at=$2,reasons=$3 WHERE id=$1',[h.id,new Date(now),JSON.stringify(h.reasons)]);return;
 }
 if(now<(job.cooldown||0)&&!reasons.some(r=>r.kind.startsWith('goal')))return;
 const directory=path.join(job.storage,'highlights',String(job.modelId));await fs.mkdir(directory,{recursive:true});
 const filename=`highlight-${now}-${randomUUID()}.mp4`;
 const {rows:[h]}=await pool.query('INSERT INTO highlights(model_id,triggered_at,last_trigger_at,directory,filename,reasons,cache_directory) VALUES($1,$2,$2,$3,$4,$5,$6) RETURNING *',[job.modelId,new Date(now),directory,filename,JSON.stringify(reasons),job.buffer.directory]);
 job.highlight={...h,...mergeHighlightWindow(null,reasons,now,{recordedThrough:job.recordedThrough,bufferStart:job.buffer.anchor||0})};
}
async function sample(job,config){
 const now=Date.now();await readBuffer(job.buffer);
 if(job.buffer.closed||now-job.buffer.lastMedia>45000)throw new Error('视频流中断，等待重连');
 const stat=await fs.statfs(job.storage);if(stat.bavail*stat.bsize<512*1024*1024)throw new Error('磁盘可用空间不足 512 MB');
 const [observations,tips,coverage,goalState,goalSignals]=await Promise.all([
  pool.query("SELECT observed_at,viewers,online,room_status,error FROM broadcast_observations WHERE model_id=$1 AND observed_at>now()-interval '7 minutes' ORDER BY observed_at",[job.modelId]),
  pool.query("SELECT message_at,received_at,amount,source FROM chat_events WHERE model_id=$1 AND kind='tip' AND message_at>now()-interval '6 minutes'",[job.modelId]),
  pool.query("SELECT started_at,ended_at,last_seen FROM chat_coverage WHERE model_id=$1 AND ended_at IS NULL",[job.modelId]),
  pool.query('SELECT state,error FROM goal_monitor_state WHERE model_id=$1',[job.modelId]),
  pool.query("SELECT id,payload FROM goal_signals WHERE model_id=$1 AND highlight_id IS NULL AND observed_at>now()-interval '30 seconds' ORDER BY id",[job.modelId])]);
 const settings=validateHighlightSettings(config);
 const decision=detectHighlight({now,since:job.since,observations:observations.rows,tips:tips.rows,coverage:coverage.rows,settings});
 const current=goalState.rows[0],gs=current?.state,fresh=gs&&now-gs.at<=30000&&!current.error;
 if(job.highlight)for(const [cycle,pending] of Object.entries(job.highlight.pendingGoals||{})){
  if(!settings.goalRecord||!fresh||!gs.available||String(gs.cycle)!==cycle||gs.key!==pending.key||gs.completed){
   delete job.highlight.pendingGoals[cycle];
   if(!fresh||!gs.available)job.highlight.interruption='目标观察中断，无法确认完成时间';
   else if(gs.completed&&gs.completionAt==null)job.highlight.interruption='目标在采集缺口内结束，无法确认完成时间';
  }
 }
 if(job.highlight&&Object.keys(job.highlight.pendingGoals||{}).length)job.highlight.end=Math.max(job.highlight.end,now+180000);
 const signals=settings.goalRecord?goalSignals.rows:[];
 const goalReasons=signals.map(s=>s.payload);
 if(settings.goalRecord&&fresh&&gs.available&&gs.near&&!gs.completed&&gs.remaining<=settings.goalNearPercent&&!job.highlight?.pendingGoals?.[gs.cycle])goalReasons.push({kind:'goalNear',cycle:gs.cycle,goalKey:gs.key,at:now,text:`目标仅剩 ${Number(gs.remaining.toFixed(2))}%：${gs.goal.description||'当前目标'}`});
 // Goal events do not need the audience warmup; they have their own progress baseline.
 if(goalReasons.length){await captureHighlight(job,goalReasons,now);if(job.highlight&&signals.length)await pool.query('UPDATE goal_signals SET highlight_id=$2 WHERE id=ANY($1::bigint[])',[signals.map(s=>s.id),job.highlight.id]);}
 // A ten-second segment must close before exporting its tail.
 if(job.highlight&&!Object.keys(job.highlight.pendingGoals||{}).length&&now>=job.highlight.end+15000){await archiveHighlight(job);job.cooldown=now+30000;}
 if(job.retainBuffer)throw new Error('高光归档失败，已保留缓存片段供恢复');
 if(jobs.size>getHighlightLimit()&&!job.highlight)return;
 if(decision.reasons.length&&(!job.highlight||now<job.highlight.end+15000))await captureHighlight(job,decision.reasons,now);
 states.set(job.modelId,{status:job.highlight?Object.keys(job.highlight.pendingGoals||{}).length?'目标高光录制中 · 等待目标完成':job.highlight.goalTail>now?'目标已完成 · 保留后续 15 分钟':'高光录制中':decision.ready?'监测中 · 已缓存':'人数 / TK 预热中 · 目标监控已就绪',activeId:job.highlight?.id||null});
 await pruneBuffer(job.buffer,job.highlight?job.highlight.start:now-140000);
}
async function tick(){
 const {rows}=await pool.query('SELECT m.*,h.config FROM highlight_settings h JOIN models m ON m.id=h.model_id WHERE h.enabled ORDER BY h.updated_at');
 const wanted=new Map(rows.map(m=>[m.id,m]));
 for(const [id,job] of jobs){const m=wanted.get(id);
  if(!m||!m.monitored||!m.online||m.room_status!=='public'||m.room_details?.recordable===false||Date.now()-new Date(m.last_seen_at)>20000){const ending=m?{...recordingInterruption(m),status:m.room_status}:null;await stopJob(id,ending?.reason||'高光录制已关闭，已保留现有片段',ending);states.set(id,{status:ending?.reason||'已关闭'});}
 }
 // Let active clips finish; idle buffers yield immediately when the limit is lowered.
 for(const id of idleHighlightsToRelease(jobs,getHighlightLimit())){await stopJob(id,'高光容量已调整');states.set(id,{status:'等待高光录制名额',waiting:true});}
 for(const id of states.keys())if(!wanted.has(id))states.delete(id);
 for(const model of rows){
  if(stopped)break;
  try{
   if(!model.monitored||!model.online||model.room_status!=='public'||model.room_details?.recordable===false||Date.now()-new Date(model.last_seen_at)>20000){states.set(model.id,{status:recordingInterruption(model).reason});continue;}
   if(!jobs.has(model.id)){
    if((retry.get(model.id)||0)>Date.now())continue;
    if(!workerState().ready){states.set(model.id,{status:'录制服务未就绪'});continue;}
    if(jobs.size>=getHighlightLimit()){states.set(model.id,{status:`等待高光录制名额（最多 ${getHighlightLimit()} 路）`,waiting:true});continue;}
    const storage=await getStorage();if(!storage.space||storage.space.available<1024*1024*1024)throw new Error('需要至少 1 GB 可用磁盘空间');
    const input=await resolveModelInput(model);let buffer;
    try{if(stopped){input.close();break;}buffer=await startBuffer(path.join(storage.directory,'.highlight-cache',randomUUID()),input);}catch(e){input.close();throw e;}
    jobs.set(model.id,{modelId:model.id,input,buffer,storage:storage.directory,since:Date.now()});
   }
   await sample(jobs.get(model.id),model.config);
  }catch(e){let error=redact(e.message),ending;try{if(jobs.has(model.id)){const room=await inspectRoomState(model);if(!room.recordable){ending={...recordingInterruption({room_status:room.status,room_details:room}),status:room.status};error=ending.reason;}}}catch{}states.set(model.id,{status:'重试等待',error});retry.set(model.id,Date.now()+60000);await stopJob(model.id,error,ending);}
 }
}
export function syncHighlights(){
 if(stopped)return Promise.resolve();
 if(!inflight)inflight=tick().catch(async e=>{
  console.error('高光录制:',redact(e.message));
  // Stop media on database/storage errors so temporary files cannot grow unbounded.
  for(const [id,j] of jobs){await stopBuffer(j.buffer).catch(()=>{});j.input.close();states.set(id,{status:'高光录制错误',error:redact(e.message)});}
 }).finally(()=>{inflight=null;});return inflight;
}
export async function startHighlights(){
 await pool.query(highlightSchema);
 await loadHighlightCapacity();
 lock=await pool.connect();const {rows:[r]}=await lock.query('SELECT pg_try_advisory_lock(73190513) AS locked');if(!r.locked){lock.release();lock=null;return;}
 const interrupted=await pool.query("UPDATE highlights SET status='已中断',error='服务重启，保留已有文件和临时片段',finished_at=now() WHERE status IN ('录制中','归档中') RETURNING *");
 for(const h of interrupted.rows){try{const file=safeFile(h),info=await probe(file),stat=await fs.stat(file);await pool.query('UPDATE highlights SET duration_seconds=$2,bytes=$3 WHERE id=$1',[h.id,Number(info.format.duration)||0,stat.size]);}catch{}}
 stopped=false;timer=setInterval(()=>void syncHighlights(),5000);void syncHighlights();
}
export async function stopHighlights(){
 stopped=true;clearInterval(timer);await inflight;
 for(const id of jobs.keys())await stopJob(id,'服务停止，已保留现有片段');
 if(lock){await lock.query('SELECT pg_advisory_unlock(73190513)');lock.release();lock=null;}
}
