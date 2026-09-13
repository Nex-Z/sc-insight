import {recordingInterruption} from '../src/room-state.js';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {captureInputArgs} from './capture-input.js';
import {recordingConcurrency,recordingCodecArgs,recordingDurationArgs} from './recording-options.js';
import {resolveModelInput} from './model-source.js';
import {inspectPublicRoom} from './public-source.js';
import {reconcileLiveTarget} from './live-watch.js';
import {recordingFilename,recordingDirectory} from './recording-name.js';
const concurrency=recordingConcurrency();
import {pool} from './db.js';
import {getStorage} from './storage.js';
import {ACTIVE,FFMPEG,FFPROBE,sourceUrl,safeFile,redact,inputArgs,runProcess,probe,humanDuration,humanSize} from './media.js';
const browserInputs=new Map();
function releaseInput(id){browserInputs.get(id)?.close?.();browserInputs.delete(id);}
const jobs=new Map();let polling=false,stopping=false,timer,lock;
let engine={ready:false,error:null};
export function workerState(){return {...engine,active:jobs.size,concurrency};}
export async function createRecording(modelId,seconds,{publicSource=false,autoRecord,untilOffline}={}){
 if(!engine.ready||stopping)throw new Error(engine.error||'录制服务尚未就绪');
 if(!Number.isInteger(Number(modelId))||Number(modelId)<1)throw new Error('请选择主播');
 const {rows:[source]}=await pool.query('SELECT * FROM recording_sources WHERE model_id=$1',[modelId]);
 const {rows:[model]}=await pool.query('SELECT name FROM models WHERE id=$1',[modelId]);if(!model)throw new Error('主播不存在');
 const continuous=untilOffline??Boolean(source?.auto_record&&source?.until_offline&&!source?.url);
 const maxSeconds=seconds==null?(source?.max_seconds||3600):Number(seconds);
 if(!Number.isInteger(maxSeconds)||maxSeconds<5||maxSeconds>21600)throw new Error('录制时长必须在 5 秒至 6 小时之间');
 const storage=await getStorage();if(storage.space&&storage.space.available<512*1024*1024)throw new Error('磁盘可用空间不足 512 MB，无法开始录制');
 const filename=recordingFilename(model.name);
 const directory=recordingDirectory(storage.directory,model.name);
 await fs.mkdir(directory,{recursive:true});
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const {rows:[r]}=await db.query("INSERT INTO recordings(model_id,filename,status,directory,max_seconds,source_url,until_offline) VALUES($1,$2,'排队中',$3,$4,$5,$6) RETURNING id,status",[modelId,filename,directory,maxSeconds,publicSource?'public-model':source?.url||'public-model',continuous]);
  if(autoRecord)await db.query('INSERT INTO recording_sources(model_id,url,auto_record,max_seconds,until_offline) VALUES($1,NULL,true,$2,$3) ON CONFLICT(model_id) DO UPDATE SET url=NULL,auto_record=true,max_seconds=excluded.max_seconds,until_offline=excluded.until_offline,updated_at=now()',[modelId,maxSeconds,continuous]);
  else if(autoRecord===false)await db.query('UPDATE recording_sources SET auto_record=false,updated_at=now() WHERE model_id=$1',[modelId]);
  await db.query('COMMIT');void pump();return r;
 }catch(e){await db.query('ROLLBACK');if(e.code==='23505')throw new Error('该主播已有进行中的录制任务');throw e;}finally{db.release();}
}
export async function createBrowserRecording(candidate,seconds=3600){
 if(!engine.ready||stopping)throw new Error(engine.error||'录制服务尚未就绪');
 if(!Number.isInteger(seconds)||seconds<5||seconds>21600)throw new Error('录制时长必须在 5 秒至 6 小时之间');
 sourceUrl(candidate.url);captureInputArgs(candidate);
 const storage=await getStorage();if(storage.space&&storage.space.available<512*1024*1024)throw new Error('磁盘可用空间不足 512 MB');
 const filename='browser_'+Date.now()+'_'+randomUUID().slice(0,8)+'.mp4';
 const db=await pool.connect();let record;
 try{await db.query('BEGIN');record=(await db.query("INSERT INTO recordings(filename,status,directory,max_seconds,source_url) VALUES($1,'排队中',$2,$3,'browser-session') RETURNING id,status",[filename,storage.directory,seconds])).rows[0];browserInputs.set(record.id,structuredClone(candidate));await db.query('COMMIT');}
 catch(e){await db.query('ROLLBACK');if(record)releaseInput(record.id);throw e;}finally{db.release();}
 void pump();return record;
}
export async function stopRecording(id,{disableAuto=true,reason='用户停止'}={}){
 const db=await pool.connect();let row;
 try{await db.query('BEGIN');row=(await db.query('SELECT * FROM recordings WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)throw new Error('任务不存在');
 if(!ACTIVE.includes(row.status))throw new Error('任务已结束');
 if(disableAuto)await db.query('UPDATE recording_sources SET auto_record=false WHERE model_id=$1',[row.model_id]);
 if(row.status==='排队中'||(row.status==='连接中'&&!jobs.has(Number(id))))await db.query("UPDATE recordings SET status='已取消',finished_at=now(),source_url=NULL WHERE id=$1",[id]);
 await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 if(row.status==='排队中')releaseInput(Number(id));
 const job=jobs.get(Number(id));if(job){job.stopRequested=true;job.stopReason=reason;job.child.stdin.write('q\n',()=>{});job.killTimer=setTimeout(()=>job.child.kill(),10000);}
 return {ok:true,autoRecord:!disableAuto};
}
async function finish(record,job,code){
 clearInterval(job.monitor);clearTimeout(job.killTimer);let finalStatus='失败',error=job.failure||null;
 if(record.until_offline&&!job.stopRequested&&!error)error='直播输入提前结束，已归档并等待自动重连';
 try{
 await job.pending;
 await pool.query("UPDATE recordings SET status='归档中' WHERE id=$1",[record.id]);
 const file=safeFile(record);const metadata=await probe(file);const stat=await fs.stat(file);
 const seconds=Number(metadata.format?.duration||job.seconds||0);
 if(seconds<=0||stat.size<100)throw new Error('未收到可归档的视频数据');
 finalStatus=code===0&&!error?'已完成':job.stopRequested&&!error?'已完成':'已中断';
 if(finalStatus==='已中断'&&!error)error='直播流意外结束，已保留可播放片段';
 await pool.query('UPDATE recordings SET status=$2,bytes=$3,duration_seconds=$4,duration=$5,size=$6,finished_at=now(),source_url=NULL,worker_pid=NULL,error=$7 WHERE id=$1',[record.id,finalStatus,stat.size,seconds,humanDuration(seconds),humanSize(stat.size),error]);
 }catch(e){error=error||redact(e.message)||'录制失败';await pool.query("UPDATE recordings SET status='失败',error=$2,finished_at=now(),source_url=NULL,worker_pid=NULL WHERE id=$1",[record.id,error]);}
 await pool.query('INSERT INTO events(model_id,title,detail) VALUES($1,$2,$3)',[record.model_id,`录像${finalStatus}`,`${record.filename}${error?' · '+error:job.stopReason?' · '+job.stopReason:''}`]);
 releaseInput(record.id);jobs.delete(record.id);job.resolve();if(!stopping)void autoRecord().then(()=>pump()).catch(e=>console.error('自动续录:',redact(e.message)));
}
async function launch(record){
 let captured=browserInputs.get(record.id);if(record.source_url==='browser-session'&&!captured)throw new Error('浏览器会话已结束，请重新检测并录制');
 if(record.source_url==='public-model'){
  const {rows:[model]}=await pool.query('SELECT * FROM models WHERE id=$1',[record.model_id]);
  if(!model)throw new Error('主播不存在');
  captured=await resolveModelInput(model);
  browserInputs.set(record.id,captured);
  const {rows:[current]}=await pool.query('SELECT status FROM recordings WHERE id=$1',[record.id]);
  if(current?.status!=='连接中'||stopping){releaseInput(record.id);return;}
 }
 const url=captured?.url||record.source_url;
 if(record.model_id){
  const {rows:[model]}=await pool.query('SELECT name FROM models WHERE id=$1',[record.model_id]);
  const startedAt=new Date(),filename=recordingFilename(model?.name,startedAt);
  const updated=await pool.query("UPDATE recordings SET filename=$2,started_at=$3 WHERE id=$1 AND status='连接中' RETURNING id",[record.id,filename,startedAt]);
  if(!updated.rowCount||stopping){releaseInput(record.id);return;}
  record.filename=filename;
 }
 const file=safeFile(record);const args=['-hide_banner','-loglevel','warning','-n',...inputArgs(url),...(record.source_url==='public-model'?['-rw_timeout','60000000','-reconnect','1','-reconnect_streamed','1','-reconnect_on_http_error','502,503,504','-reconnect_delay_max','5']:[]),...(captured?captureInputArgs(captured):[]),'-i',sourceUrl(url),'-map','0:v:0?','-map','0:a:0?',...recordingDurationArgs(record),...recordingCodecArgs(),'-movflags','+frag_keyframe+empty_moov+default_base_moof','-f','mp4','-progress','pipe:1','-nostats',file];
 const child=spawn(FFMPEG,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
 const job={child,seconds:0,stopRequested:false,pending:Promise.resolve(),lastProgress:Date.now(),done:null,resolve:null};job.done=new Promise(r=>job.resolve=r);jobs.set(record.id,job);
 child.stdin.on('error',()=>{});let buffer='',stderr='';
 child.stdout.on('data',chunk=>{buffer+=chunk;const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines){const [key,value]=line.trim().split('=');if(key==='out_time_us'&&Number(value)/1000000>job.seconds){job.seconds=Number(value)/1000000;job.lastProgress=Date.now();}}});
 child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-8192);});
 child.on('error',e=>{job.failure=e.code==='ENOENT'?'FFmpeg 不可用':redact(e.message);});
 child.on('close',code=>{if(code!==0&&!job.stopRequested&&!job.failure)job.failure=(captured?(record.source_url==='public-model'?'HTTP 媒体录制失败：直播地址可能已过期或不可访问':'浏览器媒体录制失败：流可能已过期、不可访问或受 DRM 保护'):redact(stderr))||`录制进程退出 ${code}`;if(code!==0&&!job.stopRequested&&stderr)job.failure=(job.failure||'FFmpeg 退出')+' · '+redact(stderr);void finish(record,job,code).catch(e=>{console.error('录像归档失败:',redact(e.message));releaseInput(record.id);jobs.delete(record.id);job.resolve();});});
 await pool.query('UPDATE recordings SET worker_pid=$2 WHERE id=$1',[record.id,child.pid||null]);
 job.monitor=setInterval(()=>{
 job.pending=job.pending.then(async()=>{
  if(Date.now()-job.lastProgress>(record.source_url==='public-model'?90000:45000)){job.failure='持续未收到有效视频数据，已停止';child.kill();return;}
  const stat=await fs.stat(file).catch(()=>null);const disk=await fs.statfs(record.directory);
  if(disk.bavail*disk.bsize<256*1024*1024){job.failure='磁盘可用空间不足 256 MB，已停止并保留片段';job.stopRequested=true;child.stdin.write('q\n',()=>{});job.killTimer=setTimeout(()=>child.kill(),10000);}
  await pool.query("UPDATE recordings SET status=$2,bytes=$3,duration_seconds=$4,duration=$5,size=$6 WHERE id=$1 AND status IN ('连接中','录制中')",[record.id,job.seconds>0?'录制中':'连接中',stat?.size||0,job.seconds,humanDuration(job.seconds),humanSize(stat?.size||0)]);
 }).catch(e=>{job.failure='更新录制进度失败';child.kill();console.error(redact(e.message));});
 },1500);
}
async function pump(){
 if(polling||stopping||!engine.ready)return;polling=true;
 try{while(jobs.size<concurrency){const {rows:[record]}=await pool.query("UPDATE recordings SET status='连接中',started_at=now() WHERE id=(SELECT id FROM recordings WHERE status='排队中' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *");if(!record)break;try{await launch(record);}catch(e){releaseInput(record.id);await pool.query("UPDATE recordings SET status='失败',error=$2,finished_at=now(),source_url=NULL WHERE id=$1 AND status='连接中'",[record.id,redact(e.message)]);}}}catch(e){console.error('录制队列:',redact(e.message));}finally{polling=false;}
}
let autoRunning;
export function autoRecord(){
 if(!engine.ready||stopping)return Promise.resolve();
 if(!autoRunning)autoRunning=checkAutomaticTargets().finally(()=>{autoRunning=null;});
 return autoRunning;
}
async function checkAutomaticTargets(){
 const {rows}=await pool.query('SELECT m.*,s.url FROM recording_sources s JOIN models m ON m.id=s.model_id WHERE s.auto_record=true');
 let index=0;
 await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{
  while(index<rows.length&&!stopping){const model=rows[index++];
   try{
    if(model.url){if(model.monitored&&model.online&&Date.now()-new Date(model.last_seen_at)<90000&&await eligible(model.id))await createRecording(model.id);continue;}
    await reconcileLiveTarget(model,{
     inspect:inspectPublicRoom,
     observe:room=>pool.query('UPDATE models SET online=$2,room_status=$3,last_seen_at=now() WHERE id=$1',[model.id,!['offline','idle'].includes(room.status),room.status]),
     active:async()=>(await pool.query('SELECT id FROM recordings WHERE model_id=$1 AND status=ANY($2::text[])',[model.id,ACTIVE])).rows,
     eligible:()=>eligible(model.id),
     start:async()=>{if(!stopping&&(await pool.query('SELECT 1 FROM recording_sources WHERE model_id=$1 AND auto_record=true',[model.id])).rowCount)await createRecording(model.id);},
     stop:(id,room)=>stopRecording(id,{disableAuto:false,reason:recordingInterruption({room_status:room.status,room_details:room}).reason})
    });
   }catch(e){console.error('自动录制状态检查:',redact(e.message));}
  }
 }));
}
async function eligible(modelId){
 return !(await pool.query("SELECT 1 FROM recordings WHERE model_id=$1 AND (status=ANY($2::text[]) OR (status IN ('失败','已中断') AND finished_at>now()-interval '30 seconds')) LIMIT 1",[modelId,ACTIVE])).rowCount;
}
export async function startWorker(){
 lock=await pool.connect();const {rows:[r]}=await lock.query('SELECT pg_try_advisory_lock(73190512) AS locked');if(!r.locked){lock.release();lock=null;engine.error='另一个录像 Worker 已在运行';return;}
 try{await runProcess(FFMPEG,['-version']);await runProcess(FFPROBE,['-version']);engine.ready=true;}
 catch(e){engine.error=redact(e.message);return;}
 // Interrupted tasks remain recoverable as fragmented MP4; never invent completion.
 const {rows}=await pool.query("UPDATE recordings SET status='已中断',finished_at=now(),error='服务重启，任务已中断；保留已有文件',source_url=NULL,worker_pid=NULL WHERE status IN ('连接中','录制中','归档中') RETURNING *");
 for(const record of rows){try{const f=safeFile(record);const info=await probe(f);const stat=await fs.stat(f);const seconds=Number(info.format?.duration||0);await pool.query('UPDATE recordings SET bytes=$2,duration_seconds=$3,duration=$4,size=$5 WHERE id=$1',[record.id,stat.size,seconds,humanDuration(seconds),humanSize(stat.size)]);}catch{}}
 await pool.query("UPDATE recordings SET status='失败',finished_at=now(),error='服务重启，浏览器会话已失效，请重新检测',source_url=NULL WHERE status='排队中' AND source_url='browser-session'");
 timer=setInterval(()=>void pump(),3000);void pump();
}
export async function shutdownWorker(){stopping=true;clearInterval(timer);for(const job of jobs.values()){job.stopRequested=true;job.child.stdin.write('q\n',()=>{});job.killTimer=setTimeout(()=>job.child.kill(),8000);}await Promise.all([...jobs.values()].map(j=>j.done));if(lock){await lock.query('SELECT pg_advisory_unlock(73190512)');lock.release();lock=null;}}
