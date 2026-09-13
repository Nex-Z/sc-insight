import test from 'node:test';
import assert from 'node:assert/strict';
import {detectHighlight,validateHighlightSettings} from './highlight-detection.js';
import {parseSegments,readBuffer,pruneBuffer,cleanBuffer} from './highlight-buffer.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const now=Date.now(),since=now-360000;
const observations=Array.from({length:73},(_,i)=>({observed_at:new Date(since+i*5000),online:true,room_status:'public',viewers:i<60?100:200}));
test('stable baseline then sustained increase triggers, joining warmup and initial ramp do not',()=>{
 assert.equal(detectHighlight({now,since,observations}).reasons[0].kind,'viewers');
 assert.equal(detectHighlight({now,since,observations:observations.filter((_,i)=>i%2===0)}).reasons[0].kind,'viewers');
 assert.equal(detectHighlight({now,since:now-290000,observations}).ready,false);
 assert.deepEqual(detectHighlight({now,since,observations:observations.map(o=>({...o,viewers:200}))}).reasons,[]);
});
test('one-sample spikes, tiny rooms and missing or stale samples do not trigger',()=>{
 assert.deepEqual(detectHighlight({now,since,observations:observations.map((o,i)=>({...o,viewers:i===72?2000:100}))}).reasons,[]);
 assert.deepEqual(detectHighlight({now,since,observations:observations.map(o=>({...o,viewers:o.viewers/10}))}).reasons,[]);
 assert.equal(detectHighlight({now:now+25000,since,observations}).ready,false);
 for(const change of [{error:'timeout'},{online:false},{room_status:'private'}]){const rows=observations.map((o,i)=>i===50?{...o,...change}:o);assert.equal(detectHighlight({now,since,observations:rows}).ready,false);}
 assert.equal(detectHighlight({now,since,observations:observations.filter((o,i)=>i<50||i>55)}).ready,false);
});
test('TK burst and large tip require continuous chat coverage and fresh live events',()=>{
 const flat=observations.map(o=>({...o,viewers:100}));
 const coverage=[{started_at:new Date(since),last_seen:new Date(now)}];
 const tip={source:'live',amount:800,message_at:new Date(now-5000),received_at:new Date(now-4000)};
 const check=(tips,cover=coverage)=>detectHighlight({now,since,observations:flat,tips,coverage:cover});
 assert.deepEqual(check([tip]).reasons.map(r=>r.kind),['tips','singleTip']);
 assert.deepEqual(check([tip],[]).reasons,[]);
 assert.deepEqual(check([{...tip,source:'history'}]).reasons,[]);
 assert.deepEqual(check([{...tip,received_at:new Date(now+60000)}]).reasons,[]);
 assert.deepEqual(check([{...tip,amount:null}]).reasons,[]);
 assert.deepEqual(check([{...tip,amount:50}]).reasons,[]);
 assert.deepEqual(check([tip],[{...coverage[0],ended_at:new Date(now)}]).reasons,[]);
});
test('invalid thresholds and CSV paths are rejected',()=>{
 assert.throws(()=>validateHighlightSettings({tipMinimum:-1}));assert.throws(()=>validateHighlightSettings({viewerRatio:Infinity}));assert.throws(()=>validateHighlightSettings({singleTip:'500'}));
 assert.deepEqual(parseSegments('part-000000001.ts,10,20\n"part-000000002.ts",20,30\n../secret,0,10\npart-3.ts,20,10'),[{name:'part-000000001.ts',start:10,end:20},{name:'part-000000002.ts',start:20,end:30}]);
});
test('pinned goal media survives a rolling CSV longer than twenty minutes; pruned media never reappears',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'highlight-pin-'));
 const parts=Array.from({length:130},(_,i)=>({name:`part-${String(i).padStart(9,'0')}.ts`,start:i*10,end:(i+1)*10}));
 const buffer={directory,segments:parts.slice(0,10),anchor:0,lastMedia:0};
 try{
  await Promise.all(parts.map(p=>fs.writeFile(path.join(directory,p.name),'fixture')));
  await fs.writeFile(path.join(directory,'segments.csv'),parts.slice(10).map(p=>`${p.name},${p.start},${p.end}`).join('\n'));
  await readBuffer(buffer);assert.equal(buffer.segments.length,130);await pruneBuffer(buffer,0);assert.equal(buffer.segments.length,130);
  await pruneBuffer(buffer,120000);const count=buffer.segments.length;await readBuffer(buffer);assert.equal(buffer.segments.length,count);assert.ok(buffer.segments.every(s=>s.end>=120));
 }finally{await cleanBuffer(buffer);}
});

test('trigger choices are independent and legacy settings keep all triggers enabled',()=>{
 const defaults=validateHighlightSettings({viewerIncrease:75});assert.equal(defaults.viewerRecord,true);assert.equal(defaults.tipRecord,true);assert.equal(defaults.viewerIncrease,75);
 const input={now,since,observations,coverage:[{started_at:new Date(since),last_seen:new Date(now)}],tips:[{source:'live',amount:800,message_at:new Date(now-5000),received_at:new Date(now-4000)}]};
 assert.deepEqual(detectHighlight({...input,settings:{...defaults,viewerRecord:false}}).reasons.map(r=>r.kind),['tips','singleTip']);
 assert.deepEqual(detectHighlight({...input,settings:{...defaults,tipRecord:false}}).reasons.map(r=>r.kind),['viewers']);
 assert.deepEqual(detectHighlight({...input,settings:{...defaults,viewerRecord:false,tipRecord:false}}).reasons,[]);
 assert.throws(()=>validateHighlightSettings({viewerRecord:'false'}));
});
