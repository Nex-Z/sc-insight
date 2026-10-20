import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {FFMPEG,runProcess} from './media.js';
import {inspectArchive,recoverArchive,requestMediaStop} from './media-archive.js';
import {readBuffer,exportBuffer} from './highlight-buffer.js';
import {checkRecordingRoom} from './live-watch.js';

test('manual and automatic room guard stops private/ticket media but preserves jobs on observation errors',async()=>{
 for(const status of ['private','p2p','ticketShow','paidGroupShow','offline']){
  let writes=0;
  const job={child:{stdin:{write:()=>writes++},kill:()=>{}}};
  await checkRecordingRoom(job,{}, {inspect:async()=>({status,recordable:false})});
  assert.equal(writes,1,status);assert.equal(job.stopRequested,true);clearTimeout(job.killTimer);
 }
 const job={child:{stdin:{write:()=>assert.fail('must not stop on uncertainty')},kill:()=>{}}};
 await checkRecordingRoom(job,{}, {inspect:async()=>{throw Error('HTTP 503');}});
 await checkRecordingRoom(job,{}, {inspect:async()=>({status:'unknown',recordable:false})});
 await checkRecordingRoom(job,{}, {inspect:async()=>({status:'public',recordable:true})});
 assert.equal(job.stopRequested,undefined);
 let resolve;
 const pending=checkRecordingRoom(job,{}, {inspect:()=>new Promise(r=>resolve=r)});
 job.closed=true;resolve({status:'private',recordable:false});await pending;
 assert.equal(job.stopRequested,undefined);
});

test('repeated stop requests flush once and retain one bounded kill fallback',async()=>{
 let writes=0,kills=0;
 const job={child:{stdin:{write:v=>{assert.equal(v,'q\n');writes++;}},kill:()=>kills++}};
 requestMediaStop(job,{reason:'转为私聊中',timeout:30});
 const timer=job.killTimer;
 requestMediaStop(job,{reason:'转为开票直播',timeout:3000});
 assert.equal(job.killTimer,timer);assert.equal(writes,1);assert.equal(kills,0);
 await new Promise(r=>setTimeout(r,60));assert.equal(kills,1);
});

test('real fragmented capture recovery keeps the original and rejects empty/unrecoverable media',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sc-recover-'));
 try{
  const file=path.join(root,'capture.mp4');
  await runProcess(FFMPEG,['-v','error','-f','lavfi','-i','testsrc2=size=160x90:rate=10','-t','3','-c:v','libx264','-g','10','-movflags','+frag_keyframe+empty_moov',file]);
  const original=await fs.readFile(file);
  let probes=0;
  const result=await recoverArchive(file,{inspect:async f=>{if(++probes===1)throw Error('transient probe failure');return inspectArchive(f);}});
  assert.equal(result.recovered,true);assert.ok(result.duration>=2.9);assert.notEqual(result.file,file);
  assert.deepEqual(await fs.readFile(file),original);
  assert.equal((await recoverArchive(file)).recovered,false);
  const broken=path.join(root,'broken.mp4');await fs.writeFile(broken,Buffer.alloc(1024));
  await assert.rejects(recoverArchive(broken));assert.equal((await fs.stat(broken)).size,1024);
  assert.equal((await fs.readdir(root)).filter(n=>n.startsWith('broken-recovered-')).length,0);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('highlight export survives a missing tail and discovers a final TS absent from CSV',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sc-tail-'));
 try{
  const name='part-000000000.ts';
  await runProcess(FFMPEG,['-v','error','-f','lavfi','-i','testsrc2=size=160x90:rate=10','-t','3','-c:v','libx264','-g','10','-f','mpegts',path.join(root,name)]);
  const buffer={directory:root,closed:true,segments:[],anchor:100000};
  await readBuffer(buffer);
  assert.equal(buffer.segments.length,1);assert.ok(buffer.segments[0].end>=2.9);
  buffer.segments.push({name:'part-000000001.ts',start:3,end:6});
  const output=path.join(root,'highlight.mp4');
  const result=await exportBuffer(buffer,{start:100000,end:106000,output});
  assert.ok(result.duration>=2.9);assert.equal(result.recovered,true);
  assert.ok(result.end<=103100);assert.ok((await fs.stat(path.join(root,name))).size>0);
  // Retry after a database error must not overwrite the first valid export.
  const first=await fs.readFile(output);
  await exportBuffer(buffer,{start:100000,end:106000,output});
  assert.deepEqual(await fs.readFile(output),first);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
