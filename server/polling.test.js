import test from 'node:test';
import assert from 'node:assert/strict';
import {trackedSnapshot,validatePolling} from './polling.js';
test('private room states remain online even without a public live stream',async()=>{
 const result=await trackedSnapshot({name:'fixture',source_id:'1'},{search:async()=>({models:[{name:'fixture',source_id:'1',fresh:true,online:false,room_status:'private',viewers:0}]})});
 assert.equal(result.online,true);assert.equal(result.room_status,'private');
});
test('polling intervals accept defaults and reject unsafe values',()=>{
 assert.deepEqual(validatePolling({trackedSeconds:5,generalSeconds:60}),{trackedSeconds:5,generalSeconds:60});
 for(const n of [0,4,3601,5.5,'5'])assert.throws(()=>validatePolling({trackedSeconds:n,generalSeconds:60}));
});
test('missing identities and network errors cannot become offline observations',async()=>{
 const m={name:'fixture',source_id:'1'};
 await assert.rejects(trackedSnapshot(m,{search:async()=>({models:[]})}));
 await assert.rejects(trackedSnapshot(m,{search:async()=>{throw new Error('HTTP 429');}}),/429/);
 const result=await trackedSnapshot(m,{search:async()=>({models:[{name:'fixture',source_id:'1',viewers:0,fresh:false}]}),inspect:async()=>({modelId:'1',status:'offline'})});assert.equal(result.online,false);
});
test('official off status is offline even when account isOnline remains true',async()=>{
 const found=await trackedSnapshot({name:'fixture',source_id:'1'},{search:async()=>({models:[{name:'fixture',source_id:'1',fresh:true,online:true,room_status:'off',viewers:94}]}),inspect:async()=>{throw Error('Known offline state must not require HTML fallback');}});
 assert.equal(found.online,false);assert.equal(found.room_status,'offline');
});
