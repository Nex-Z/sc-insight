// Isolated PostgreSQL + local HLS regression. Never contacts a live platform.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import pg from 'pg';
import express from 'express';
import {pool} from './db.js';
import {FFMPEG,runProcess,probe,safeFile} from './media.js';
import {recordingSchema} from './recording-schema.js';
import {startWorker,shutdownWorker,createRecording,stopRecording} from './recorder.js';
import {insightRoutes} from './insight-routes.js';
import {recordingRoutes} from './recording-routes.js';
import {startBuffer,readBuffer} from './highlight-buffer.js';
import {archiveHighlight,recoverHighlight} from './highlights.js';
const schema='resilience_'+Date.now(),root=path.resolve('artifacts',schema);
const admin=new pg.Client({connectionTimeoutMillis:5000});
let server,worker=false;
await fs.mkdir(root,{recursive:true});
await admin.connect();await admin.query(`CREATE SCHEMA ${schema}`);pool.options.options=`-c search_path=${schema}`;
async function waitFor(get,accept,timeout=30000){
 const until=Date.now()+timeout;
 while(Date.now()<until){const value=await get();if(accept(value))return value;await new Promise(r=>setTimeout(r,100));}
 throw Error('Timed out waiting for media state');
}
try{
 await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['server/init.js'],{env:{...process.env,PGOPTIONS:`-c search_path=${schema}`},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);child.on('error',reject);child.on('close',code=>code?reject(Error(log)):resolve());
 });
 await pool.query("INSERT INTO settings(key,value) VALUES('storage',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[{directory:root}]);
 const model=(await pool.query("INSERT INTO models(name,country,language,color) VALUES('resilience-fixture','test','test','#888') RETURNING *")).rows[0];
 const seeds=[
  ['request-failed','主清单请求失败（HTTP 404）',0],
  ['archive-failed','读取媒体超时',2048],
  ['unknown-empty-failure','未知故障',0],
 ];
 for(const [filename,error,bytes] of seeds)await pool.query("INSERT INTO recordings(model_id,filename,status,error,bytes,directory) VALUES($1,$2,'失败',$3,$4,$5)",[model.id,filename,error,bytes,root]);
 await recordingSchema(pool);
 const app=express();app.use(express.json());app.use('/api',insightRoutes,recordingRoutes);
 app.get('/media/denied.ts',(req,res)=>res.sendStatus(403));
 // Slow synthetic HLS packets enough to stop a recording while it is running.
 app.use('/media',async(req,res,next)=>{if(req.path.endsWith('.ts'))await new Promise(r=>setTimeout(r,350));next();},express.static(root));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const content=async suffix=>(await fetch(base+'/api/content'+suffix)).json();
 const normal=await content('');
 assert.equal(normal.total,2);assert.equal(normal.recordingCount,2);
 assert.ok(normal.items.every(r=>r.filename!=='request-failed'));
 assert.equal((await content('?status=failed')).total,3);
 assert.equal((await content('?q=request-failed')).total,0);
 console.log('PASS historical request failures hidden; archive/unknown failures and explicit diagnostic filter preserved');
 await runProcess(FFMPEG,['-v','error','-f','lavfi','-i','testsrc2=size=160x90:rate=10','-t','40','-c:v','libx264','-preset','ultrafast','-g','10','-f','hls','-hls_time','1','-hls_list_size','0',path.join(root,'fixture.m3u8')],{timeout:30000});
 await runProcess(FFMPEG,['-v','error','-i',path.join(root,'fixture.m3u8'),'-c','copy','-movflags','+frag_keyframe+empty_moov','-f','mp4',path.join(root,'archive-failed')]);
 await pool.query("UPDATE recordings SET bytes=0 WHERE filename='archive-failed'");
 await pool.query('INSERT INTO recording_sources(model_id,url,auto_record) VALUES($1,$2,false)',[model.id,base+'/media/fixture.m3u8']);
 await startWorker();worker=true;
 const restored=(await pool.query("SELECT * FROM recordings WHERE filename='archive-failed'")).rows[0];
 assert.equal(restored.status,'已中断');assert.ok(restored.duration_seconds>=39);
 console.log('PASS startup recovers an existing recording even when failed metadata reports zero bytes');
 const record=await createRecording(model.id,60);
 const getRecord=async()=> (await pool.query('SELECT * FROM recordings WHERE id=$1',[record.id])).rows[0];
 await waitFor(getRecord,r=>r.status==='录制中'&&r.duration_seconds>=2);
 await stopRecording(record.id,{disableAuto:false,reason:'转为私聊中，已保留此前片段'});
 const saved=await waitFor(getRecord,r=>['已完成','已中断','失败'].includes(r.status));
 assert.notEqual(saved.status,'失败',saved.error);assert.ok(saved.bytes>1000);assert.ok(saved.duration_seconds>=2);
 assert.ok(Number((await probe(safeFile(saved))).format.duration)>=2);
 const download=await fetch(base+`/api/recordings/${record.id}/file?download=1`,{headers:{Range:'bytes=0-1023'}});
 assert.equal(download.status,206);assert.equal((await download.arrayBuffer()).byteLength,1024);
 console.log('PASS running recorder stops and archives existing media, downloadable with HTTP 206');
 const lines=(await fs.readFile(path.join(root,'fixture.m3u8'),'utf8')).split('\n');
 await fs.writeFile(path.join(root,'interrupted.m3u8'),[...lines.slice(0,lines.findIndex(s=>s==='fixture5.ts')+1),'#EXTINF:1.000000,','denied.ts','#EXT-X-ENDLIST'].join('\n'));
 await pool.query('UPDATE recording_sources SET url=$2,auto_record=true WHERE model_id=$1',[model.id,base+'/media/interrupted.m3u8']);
 const continuous=await createRecording(model.id,60,{untilOffline:true});
 const interrupted=await waitFor(async()=>(await pool.query('SELECT * FROM recordings WHERE id=$1',[continuous.id])).rows[0],r=>['已完成','已中断','失败'].includes(r.status));
 assert.equal(interrupted.status,'已中断',interrupted.error);assert.ok(interrupted.duration_seconds>=4);
 assert.ok(Number((await probe(safeFile(interrupted))).format.duration)>=4);
 await pool.query('UPDATE recording_sources SET auto_record=false WHERE model_id=$1',[model.id]);
 console.log('PASS continuous automatic recording retains earlier video after an HTTP 403 segment');
 // A public-source resolution failure must not pollute the content list.
 const badModel=(await pool.query("INSERT INTO models(name,country,language,color) VALUES('invalid name','test','test','#888') RETURNING id")).rows[0];
 const failed=await createRecording(badModel.id,5,{publicSource:true});
 const failure=await waitFor(async()=>(await pool.query('SELECT * FROM recordings WHERE id=$1',[failed.id])).rows[0],r=>r.status==='失败');
 assert.equal(failure.preflight_failed,true);assert.equal(Number(failure.bytes),0);
 assert.ok(!(await content('')).items.some(r=>r.id===failed.id));
 console.log('PASS new preflight failures are flagged before any media is written');
 const buffer=await startBuffer(path.join(root,'highlight-cache'),{url:base+'/media/fixture.m3u8',method:'GET',headers:{}});
 await waitFor(()=>buffer.closed,v=>v,60000);await readBuffer(buffer);
 assert.ok(buffer.segments.length>=3,buffer.error);
 // Simulate the unavailable tail after a room transition.
 const missing=buffer.segments.at(-1);await fs.unlink(path.join(buffer.directory,missing.name));
 for(const status of ['private','ticketShow']){
  const h=(await pool.query("INSERT INTO highlights(model_id,directory,filename,cache_directory) VALUES($1,$2,$3,$4) RETURNING *",[model.id,root,status+'.mp4',buffer.directory])).rows[0];
  const job={buffer,highlight:{...h,start:buffer.anchor,end:buffer.anchor+40000}};
  await archiveHighlight(job,`转为${status}，已保留此前片段`);
  const saved=(await pool.query('SELECT * FROM highlights WHERE id=$1',[h.id])).rows[0];
  assert.equal(saved.status,'已中断',saved.error);assert.ok(saved.duration_seconds>=20);
  assert.ok(saved.bytes>1000);assert.equal(job.keepRecoveredCache,true);
  await probe(safeFile(saved));
 }
 console.log('PASS private/ticket highlight interruption preserves playable earlier segments and recovery cache');
 const broken=(await pool.query("INSERT INTO highlights(model_id,directory,filename,cache_directory) VALUES($1,$2,'retry.mp4',$3) RETURNING *",[model.id,path.join(root,'temporarily-unavailable'),buffer.directory])).rows[0];
 await archiveHighlight({buffer,highlight:{...broken,start:buffer.anchor,end:buffer.anchor+40000}},'模拟存储临时不可用');
 const failedHighlight=(await pool.query('SELECT * FROM highlights WHERE id=$1',[broken.id])).rows[0];
 assert.equal(failedHighlight.status,'失败');assert.ok(failedHighlight.recovery_state.segments.length);
 await fs.mkdir(failedHighlight.directory);
 await recoverHighlight(failedHighlight);
 const recovered=(await pool.query('SELECT * FROM highlights WHERE id=$1',[broken.id])).rows[0];
 assert.equal(recovered.status,'已中断');assert.ok(recovered.bytes>1000);await probe(safeFile(recovered));
 console.log('PASS failed highlight recovers from persisted cache/window after storage returns');
}finally{
 if(worker)await shutdownWorker();
 if(server)await new Promise(r=>server.close(r));
 await pool.end();
 await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
}
