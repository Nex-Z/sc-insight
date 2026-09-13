import test from 'node:test';
import assert from 'node:assert/strict';
import {trackedInterval,trackedSnapshot,validatePolling} from './polling.js';
const model={name:'fixture',source_id:'1'};
test('room inspection overrides misleading search offline state for a ticket show',async()=>{
 const result=await trackedSnapshot(model,{search:async()=>({models:[{...model,viewers:10,room_status:'offline',online:false}]}),inspect:async()=>({modelId:'1',status:'ticketShow',online:true,recordable:false})});
 assert.equal(result.online,true);assert.equal(result.room_status,'ticketShow');assert.equal(result.room_details.recordable,false);
});
test('polling intervals accept defaults and reject unsafe values',()=>{
 assert.deepEqual(validatePolling({trackedSeconds:5,generalSeconds:60}),{trackedSeconds:5,generalSeconds:60});
 for(const n of [0,4,3601,5.5,'5'])assert.throws(()=>validatePolling({trackedSeconds:n,generalSeconds:60}));
});
test('room HTTP failure never becomes offline; missing search does not hide confirmed status',async()=>{
 await assert.rejects(trackedSnapshot(model,{search:async()=>({models:[]}),inspect:async()=>{throw Error('HTTP 429');}}),/429/);
 const result=await trackedSnapshot(model,{search:async()=>{throw Error('search unavailable');},inspect:async()=>({modelId:'1',status:'offline',online:false})});assert.equal(result.online,false);assert.equal(result.viewers,null);
 await assert.rejects(trackedSnapshot(model,{search:async()=>({models:[]}),inspect:async()=>({modelId:'2',status:'offline',online:false})}),/身份/);
});

test('highlight sampling automatically accelerates only enabled models and restores configured cadence',()=>{
 const m={highlight_active:true};assert.equal(trackedInterval(m,60),5);assert.equal(trackedInterval(m,3600),5);m.highlight_active=false;assert.equal(trackedInterval(m,60),60);assert.equal(trackedInterval({},15),15);
});
