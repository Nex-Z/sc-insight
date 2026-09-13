import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import {pool} from './db.js';
import {FFMPEG,runProcess,safeFile} from './media.js';
import {startBuffer,readBuffer,stopBuffer,pruneBuffer,cleanBuffer} from './highlight-buffer.js';
import {captureHighlight,archiveHighlight} from './highlights.js';
import {highlightRoutes} from './highlight-routes.js';
import {detectHighlight} from './highlight-detection.js';
import {saveGoalObservation} from './goal-monitor.js';
const root=path.resolve('artifacts/highlight-check-'+Date.now());await fs.mkdir(root,{recursive:true});
const app=express();app.use(express.json());app.use('/media',express.static(root));app.use('/api',highlightRoutes);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
let model,buffer,job,guard;
try{
 // Local synthetic HLS fixture: no platform requests or user recording settings.
 await runProcess(FFMPEG,['-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=10','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','160','-c:v','libx264','-preset','ultrafast','-g','20','-c:a','aac','-f','hls','-hls_time','10','-hls_list_size','0',path.join(root,'fixture.m3u8')],{timeout:60000});
 model=(await pool.query("INSERT INTO models(name,country,language,color,online,monitored) VALUES($1,'测试','测试','#888',false,false) RETURNING id",['highlight_test_'+Date.now()])).rows[0];
 const endpoint=base+`/api/models/${model.id}/highlights`;
 assert.equal((await fetch(endpoint,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:'yes'})})).status,400);
 assert.equal((await fetch(endpoint,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true})})).status,200);
 assert.equal((await pool.query('SELECT monitored FROM models WHERE id=$1',[model.id])).rows[0].monitored,true);
 buffer=await startBuffer(path.join(root,'cache'),{url:base+'/media/fixture.m3u8',method:'GET',headers:{}});
 await Promise.race([buffer.done,new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('buffer timeout')),30000);t.unref();})]);await readBuffer(buffer);
 assert.ok(buffer.segments.length>=15,buffer.error);
 const now=buffer.anchor+buffer.segments.at(-1).end*1000-30000;
 const observations=Array.from({length:73},(_,i)=>({observed_at:new Date(now-360000+i*5000),viewers:i<60?100:200,online:true,room_status:'public'}));
 const decision=detectHighlight({now,since:now-360000,observations});assert.ok(decision.reasons.length);
 job={modelId:model.id,buffer,storage:root};await captureHighlight(job,decision.reasons,now);
 const id=job.highlight.id,initialEnd=job.highlight.end;
 await captureHighlight(job,[{kind:'tips',text:'30 秒内 800 TK',value:800}],now+10000);
 assert.equal(job.highlight.id,id);assert.equal(job.highlight.end,initialEnd+10000);assert.equal(job.highlight.reasons.length,2);
 await captureHighlight(job,decision.reasons,now+800000);assert.equal(job.highlight.end,job.highlight.start+900000);
 // Completed fixture has a shorter tail; archive as interrupted, retaining actual duration.
 await pruneBuffer(buffer,job.highlight.start);
 await archiveHighlight(job,'测试媒体结束，保留实际片段');
 const h=(await pool.query('SELECT * FROM highlights WHERE id=$1',[id])).rows[0];assert.equal(h.status,'已中断',h.error);assert.ok(h.duration_seconds>=140);assert.ok(h.bytes>1000);
 const listing=await (await fetch(endpoint)).json();assert.equal(listing.items[0].id,id);assert.equal(listing.items[0].reasons.length,2);
 const media=await fetch(base+`/api/highlights/${id}/file`,{headers:{Range:'bytes=0-1023'}});assert.equal(media.status,206);assert.equal((await media.arrayBuffer()).byteLength,1024);
 await fetch(endpoint,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:false})});assert.equal((await (await fetch(endpoint)).json()).enabled,false);
 await fs.copyFile(safeFile(h),path.resolve('artifacts/highlight-fixture.mp4'));
 job.cooldown=now+1000;await captureHighlight(job,decision.reasons,now);assert.equal(job.highlight,null);job.cooldown=0;
 // Reuse the synthetic media as an independent archive fixture, after testing exclusion.
 await captureHighlight(job,decision.reasons,now);assert.equal(job.highlight.start,job.recordedThrough);job.highlight.start=now-120000;const completeId=job.highlight.id;await archiveHighlight(job);assert.equal((await pool.query('SELECT status FROM highlights WHERE id=$1',[completeId])).rows[0].status,'已完成');
 await captureHighlight(job,decision.reasons,now);job.highlight.directory=path.join(root,'missing-directory');const failedId=job.highlight.id;await archiveHighlight(job);assert.equal(job.retainBuffer,true);assert.equal((await pool.query('SELECT status FROM highlights WHERE id=$1',[failedId])).rows[0].status,'失败');assert.ok((await fs.readdir(buffer.directory)).some(n=>n.endsWith('.ts')));
 const db=await pool.connect();let near,complete;try{
  await db.query('BEGIN');const subject={...model,name:'GoalFixture',config:{goalNotify:true}};const g=spent=>({description:'测试目标',target:1000,spent});
  await saveGoalObservation(db,subject,g(100),now-20000);near=await saveGoalObservation(db,subject,g(990),now-10000);await saveGoalObservation(db,subject,g(990),now-5000);
  complete=await saveGoalObservation(db,subject,g(1000),now);await saveGoalObservation(db,subject,g(1000),now+1000);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM goal_signals WHERE model_id=$1',[model.id])).rows[0].n,2);assert.equal((await db.query('SELECT count(*)::int AS n FROM events WHERE model_id=$1',[model.id])).rows[0].n,2);await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 job.recordedThrough=0;await captureHighlight(job,near.signals,now-10000);const goalId=job.highlight.id;await captureHighlight(job,complete.signals,now);assert.equal(job.highlight.id,goalId);assert.equal(job.highlight.end,now+900000);await captureHighlight(job,decision.reasons,now+1000);assert.equal(job.highlight.end,now+900000);await archiveHighlight(job,'合成媒体结束');
 await fs.writeFile(path.join(root,'live.m3u8'),(await fs.readFile(path.join(root,'fixture.m3u8'),'utf8')).replace('#EXT-X-ENDLIST',''));
 guard=await startBuffer(path.join(root,'guard-cache'),{url:base+'/media/live.m3u8',method:'GET',headers:{}});
 const deadline=Date.now()+10000;while(!guard.segments.length&&Date.now()<deadline){await new Promise(r=>setTimeout(r,200));await readBuffer(guard);}assert.ok(guard.segments.length,'live guard received media');assert.equal(guard.closed,false);
 guard.child.stdin.end();await Promise.race([guard.done,new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('writer outlived parent connection')),6000);t.unref();})]);assert.equal(guard.closed,true);
 const report={ok:true,synthetic:true,checks:['HLS to rolling TS','five minute baseline trigger','merged viewer and TK event','15 minute cap and cooldown','completed and interrupted MP4 archive','failed export preserves cache','goal notification deduplication','goal completion extends same recording by 15 minutes','parent disconnect stops writer','settings API','HTTP Range 206'],duration:h.duration_seconds,bytes:h.bytes};await fs.writeFile('artifacts/highlight-verification.json',JSON.stringify(report,null,2));console.log(report);
}finally{
 if(buffer){await stopBuffer(buffer);await cleanBuffer(buffer);}
 if(guard){await stopBuffer(guard);await cleanBuffer(guard);}
 if(model){await pool.query('DELETE FROM events WHERE model_id=$1',[model.id]);await pool.query('DELETE FROM highlights WHERE model_id=$1',[model.id]);await pool.query('DELETE FROM highlight_settings WHERE model_id=$1',[model.id]);await pool.query('DELETE FROM models WHERE id=$1',[model.id]);}
 server.closeAllConnections();await new Promise(r=>server.close(r));await pool.end();
}
