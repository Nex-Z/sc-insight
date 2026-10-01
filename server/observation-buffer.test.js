import test from 'node:test';
import assert from 'node:assert/strict';
import {ObservationBuffer,groupObservations} from './observation-buffer.js';
import {detectHighlight} from './highlight-detection.js';
const sample=(viewers=100)=>({online:true,room_status:'public',viewers});

test('five-second samples remain live while history commits once per minute',()=>{
 const buffer=new ObservationBuffer();let writes=0;
 for(let now=0;now<=60000;now+=5000){if(buffer.add(1,sample(),5,now)){writes++;buffer.committed(1,buffer.pending(1).length);}}
 assert.equal(writes,2);assert.equal(buffer.recent(1).length,13);assert.equal(buffer.pending(1).length,0);
 assert.equal(buffer.current(1).observed_at,new Date(60000).toISOString());
});
test('transitions, failures, recovery and gaps flush early without discarding unsaved samples',()=>{
 const buffer=new ObservationBuffer();buffer.add(1,sample(),5,0);buffer.committed(1,1);
 assert.equal(buffer.add(1,sample(),5,5000),false);
 assert.equal(buffer.add(1,{error:'upstream'},5,10000),true);
 assert.equal(buffer.pending(1).length,2);
 const groups=groupObservations(buffer.pending(1));assert.equal(groups.length,2);assert.equal(groups[0].summary.internalSeconds,0);
 buffer.committed(1,2);assert.equal(buffer.add(1,sample(),5,15000),true);buffer.committed(1,1);
 assert.equal(buffer.add(1,sample(),5,60000),true);
 assert.equal(buffer.add(1,{...sample(),online:false,room_status:'offline'},5,65000),true);
});
test('summary preserves sample count, peak and weighted area and splits unknown viewer coverage',()=>{
 const rows=[100,200,150].map((viewers,i)=>({...sample(viewers),observed_at:new Date(i*5000).toISOString(),interval_seconds:5}));
 const [group]=groupObservations(rows);assert.equal(group.summary.count,3);assert.equal(group.summary.viewerSum,450);assert.equal(group.summary.peak,200);assert.equal(group.summary.internalSeconds,10);assert.equal(group.summary.internalAverage,162.5);
 assert.equal(groupObservations([...rows,{...rows[2],viewers:null,observed_at:new Date(15000).toISOString()}]).length,2);
 assert.equal(groupObservations([rows[0],{...rows[1],observed_at:new Date(60000).toISOString()}]).length,2);
});
test('buffers remain bounded during database failure and recent data replaces matching persisted points',()=>{
 const buffer=new ObservationBuffer();for(let i=0;i<1000;i++)buffer.add(1,sample(i),5,i*5000);
 assert.equal(buffer.pending(1).length,120);
 const first=buffer.recent(1)[0];const merged=buffer.recent(1,[{...first,viewers:-1}]);assert.equal(merged[0].viewers,first.viewers);
 buffer.retain(new Set());assert.equal(buffer.entries.size,0);
});
test('highlights still see five-second acceleration before the next history checkpoint',()=>{
 const buffer=new ObservationBuffer(),persisted=[];
 for(let i=0;i<72;i++)if(buffer.add(1,sample(i<60?100:200),5,i*5000)){persisted.push(buffer.pending(1).at(-1));buffer.committed(1,buffer.pending(1).length);}
 const now=355000;
 assert.equal(detectHighlight({now,since:0,observations:persisted}).ready,false);
 assert.equal(detectHighlight({now,since:0,observations:buffer.recent(1,persisted)}).reasons[0].kind,'viewers');
 const interrupted=new ObservationBuffer();interrupted.add(1,sample(),5,now);
 assert.equal(detectHighlight({now,since:now,observations:interrupted.recent(1,persisted)}).ready,false);
});
