import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pool} from './db.js';
import {sample,captureHighlight} from './highlights.js';
import {validateHighlightSettings} from './highlight-detection.js';
import {mergeHighlightWindow} from './goal-detection.js';

test('prebuffer defaults to zero for existing configs and accepts only bounded integer seconds',()=>{
 assert.equal(validateHighlightSettings().prebufferSeconds,0);
 assert.equal(validateHighlightSettings({goalNearPercent:2}).prebufferSeconds,0);
 for(const n of [0,1,60,300])assert.equal(validateHighlightSettings({prebufferSeconds:n}).prebufferSeconds,n);
 for(const n of [-1,301,0.5,'60',Infinity,NaN])assert.throws(()=>validateHighlightSettings({prebufferSeconds:n}));
});

test('clip windows respect per-model prebuffer, available media and previous archive boundaries',()=>{
 const now=1000000;
 assert.equal(mergeHighlightWindow(null,[],now).start,now);
 assert.equal(mergeHighlightWindow(null,[],now,{prebufferSeconds:60}).start,now-60000);
 assert.equal(mergeHighlightWindow(null,[],now,{prebufferSeconds:300,bufferStart:now-20000}).start,now-20000);
 assert.equal(mergeHighlightWindow(null,[],now,{prebufferSeconds:60,recordedThrough:now-10000}).start,now-10000);
});

test('zero mode monitors without media, starts only on a trigger and reuses an active recording',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sc-prebuffer-'));
 let launches=0,trigger=false;
 const now=Date.now();
 t.mock.method(pool,'query',async sql=>{
  if(sql.includes('FROM goal_signals'))return {rows:trigger?[{id:'1',payload:{kind:'goalComplete',cycle:1,at:now,text:'fixture'}}]:[]};
  if(sql.startsWith('INSERT INTO highlights'))return {rows:[{id:'fixture'}]};
  return {rows:[]};
 });
 const job={modelId:123,since:now,buffer:null,ensureMedia:async()=>{
  launches++;job.storage=root;const directory=path.join(root,'cache');await fs.mkdir(directory);
  job.buffer={directory,created:now,lastMedia:Date.now(),anchor:null,segments:[]};return true;
 }};
 try{
  await sample(job,{});await sample(job,{});
  assert.equal(launches,0);assert.equal(job.buffer,null);assert.equal(job.highlight,undefined);
  trigger=true;await sample(job,{});
  assert.equal(launches,1);assert.ok(job.highlight);assert.ok(job.highlight.start>=now);
  const id=job.highlight.id;await sample(job,{});
  assert.equal(launches,1);assert.equal(job.highlight.id,id);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('capacity refusal leaves a trigger unrecorded rather than creating a phantom clip',async t=>{
 t.mock.method(pool,'query',()=>{throw new Error('must not write a highlight without media');});
 const job={cooldown:0,ensureMedia:async()=>false};
 await captureHighlight(job,[{kind:'goalComplete'}],Date.now());
 assert.equal(job.highlight,undefined);
});

test('switching idle media to zero closes the input and removes its temporary files',async t=>{
 t.mock.method(pool,'query',async()=>({rows:[]}));
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sc-idle-'));
 const directory=path.join(root,'cache');await fs.mkdir(directory);
 let closed=0;const buffer={directory,created:Date.now(),lastMedia:Date.now(),segments:[],done:Promise.resolve()};
 buffer.child={stdin:{write:()=>{buffer.closed=true;}},kill:()=>{}};
 const job={modelId:125,storage:root,since:Date.now(),buffer,input:{close:()=>closed++}};
 try{
  await sample(job,{prebufferSeconds:0});
  assert.equal(job.buffer,null);assert.equal(closed,1);
  await assert.rejects(fs.access(directory));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('positive prebuffer retains only the requested window plus segment margin',async t=>{
 t.mock.method(pool,'query',async()=>({rows:[]}));
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sc-window-'));
 const now=Date.now(),parts=Array.from({length:20},(_,i)=>({name:`part-${String(i).padStart(9,'0')}.ts`,start:i*10,end:(i+1)*10}));
 await Promise.all(parts.map(p=>fs.writeFile(path.join(root,p.name),'fixture')));
 await fs.writeFile(path.join(root,'segments.csv'),parts.map(p=>`${p.name},${p.start},${p.end}`).join('\n'));
 const buffer={directory:root,anchor:now-200000,lastMedia:now,segments:parts};
 try{
  await sample({modelId:126,storage:root,since:now,buffer},{prebufferSeconds:30});
  assert.ok(buffer.segments.length>=4&&buffer.segments.length<=6);
  assert.ok(buffer.segments.every(p=>p.end>=150));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
