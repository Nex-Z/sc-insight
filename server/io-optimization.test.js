import test from 'node:test';
import assert from 'node:assert/strict';
import {createDashboardLoader} from './dashboard.js';
import {goalCheckpoint,goalInterval} from './goal-checkpoint.js';
import {createMessageBuffer} from './message-buffer.js';
import {withLiveCoverage} from './chat-monitor.js';

test('dashboard callers share refresh, expire together and retry after errors',async()=>{
 let now=0,calls=0,fail=false;
 const load=createDashboardLoader({query:async()=>{calls++;if(fail)throw Error('offline');return {rows:[{value:calls}]};}},{now:()=>now,ttl:180000});
 const results=await Promise.all(Array.from({length:20},()=>load()));
 assert.equal(calls,2);assert.equal(results[0],results[19]);
 now=179999;await load();assert.equal(calls,2);
 now=180000;fail=true;await assert.rejects(load(),/offline/);
 fail=false;await load();assert.equal(calls,6);
});

test('unchanged goal checkpoints reduce writes without losing live continuity or completion',()=>{
 let previous,updates=0;
 for(let now=0;now<=55000;now+=5000){
  const {result,persist}=goalCheckpoint(previous,{description:'goal',target:100,spent:50},now,1);
  if(persist)updates++;
  previous={state:result.state,savedState:persist?result.state:previous.savedState,savedAt:persist?now:previous.savedAt};
 }
 assert.equal(updates,2);
 const completed=goalCheckpoint(previous,{description:'goal',target:100,spent:100},60000,1);
 assert.equal(completed.persist,true);assert.equal(completed.result.signals[0].kind,'goalComplete');
 const gap=goalCheckpoint(previous,{description:'goal',target:100,spent:100},90000,1);
 assert.deepEqual(gap.result.signals,[]);
 const failed=goalCheckpoint({...previous,state:{...previous.state,available:false},error:'offline'},{description:'goal',target:100,spent:100},60000,1);
 assert.deepEqual(failed.result.signals,[]);assert.equal(failed.persist,true);
 assert.equal(goalInterval({online:false}),120000);assert.equal(goalInterval({online:true}),5000);
});

test('chat batch keeps receive timestamps and flushes tips and shutdown immediately',async()=>{
 const writes=[];const buffer=createMessageBuffer(async batch=>writes.push(batch),{delay:60000});
 buffer.add({id:'one',type:'text',receivedAt:'2026-09-30T10:00:00.000Z'});
 buffer.add({id:'two',type:'text'});assert.equal(writes.length,0);
 buffer.add({id:'tip',type:'tip'});await buffer.flush();
 assert.equal(writes.length,1);assert.equal(writes[0].length,3);assert.equal(writes[0][0].receivedAt,'2026-09-30T10:00:00.000Z');
 buffer.add({id:'last',type:'text'});await buffer.close();assert.equal(writes.length,2);assert.equal(buffer.pending,0);assert.equal(buffer.add({}),false);
});

test('chat batches enforce backpressure across in-flight writes and surface failures',async()=>{
 let release;const buffer=createMessageBuffer(()=>new Promise(resolve=>{release=resolve;}),{limit:2,size:2});
 buffer.add({id:1,type:'text'});buffer.add({id:2,type:'text'});await Promise.resolve();
 assert.equal(buffer.add({id:3,type:'text'}),false);release();await buffer.close();assert.equal(buffer.pending,0);
 let failed=false;const broken=createMessageBuffer(async()=>{throw Error('storage failed');},{size:1,onError:()=>{failed=true;}});
 broken.add({id:1,type:'text'});await assert.rejects(broken.close(),/storage failed/);assert.equal(failed,true);
});

test('live heartbeat stays fresh between checkpoints, failures close coverage immediately',()=>{
 const rows=[{id:5,last_seen:new Date(0),ended_at:null}];
 const client={coverage:5,lastSeen:25000,status:'connected'};
 assert.equal(+withLiveCoverage(rows,client)[0].last_seen,25000);
 assert.equal(+rows[0].last_seen,0);
 assert.equal(+withLiveCoverage(rows,{...client,failed:true})[0].ended_at,25000);
 assert.equal(withLiveCoverage(rows,null)[0],rows[0]);
});
