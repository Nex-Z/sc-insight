import test from 'node:test';
import assert from 'node:assert/strict';
import {profileSnapshot,validateMetadata,comparePeriods} from './insight-logic.js';
import {createPublicInfo} from './public-info.js';
test('HTTP 200 with malformed optional profile parts is unavailable, not empty content',async()=>{
 const info=createPublicInfo({fetcher:async url=>Response.json(url.endsWith('/cam')?{user:{user:{id:1,username:'demo'}}}:{unexpected:true})});
 const profile=await info.profile({source_id:'1',name:'demo'});
 for(const field of ['profile','menu','albums'])assert.ok(profile.unavailable.includes(field));
 const result=profileSnapshot({bio:'keep',menu:{enabled:true,items:[]},albums:[]},profile);assert.equal(result.data.bio,'keep');assert.deepEqual(result.changes,[]);
});
test('profile first baseline and optional failures never manufacture removal; recovery compares last successful values',()=>{
 const profile={name:'A',bio:'old',statusText:'',followers:10,menu:{enabled:true,items:[{activity:'music',price:5}]},albums:{items:[{id:'1',name:'Public',count:1,photos:[{id:'1',url:'a'}]}]},unavailable:[]};
 const first=profileSnapshot(null,profile);assert.deepEqual(first.changes,[]);
 const failed=profileSnapshot(first.data,{...profile,bio:'',menu:{items:[]},albums:null,unavailable:['profile','menu','albums']});assert.deepEqual(failed.data,first.data);assert.deepEqual(failed.changes,[]);
 const next=profileSnapshot(failed.data,{...profile,bio:'new',followers:11,albums:{items:[{id:'1',name:'Public',count:2,photos:[{id:'2',url:'b'},{id:'1',url:'a'}]}]}});
 assert.deepEqual(next.changes.map(c=>c.field),['bio','photos','albums']);assert.equal(next.changes[1].photos[0].id,'2');assert.equal(next.data.followers,11);
 assert.deepEqual(profileSnapshot(next.data,{...profile,bio:'new',albums:{items:[{id:'1',name:'Public',count:2,photos:[{id:'1',url:'a'}]}]}}).changes,[]);
});
test('content markers cannot escape media duration and metadata stays bounded',()=>{
 const v={title:'demo',note:'memo',favorite:true,watched:false,tags:[' a ','a'],marks:[{label:'clip',start:2,end:6}]};assert.deepEqual(validateMetadata(v,10).tags,['a']);
 for(const mark of [{start:-1},{start:11},{start:2,end:2},{start:2,end:20},{start:NaN}])assert.throws(()=>validateMetadata({...v,marks:[{label:'bad',...mark}]},10));
 assert.throws(()=>validateMetadata({...v,tags:['']},10));assert.throws(()=>validateMetadata({...v,favorite:'true'},10));assert.throws(()=>validateMetadata({...v,title:'a'.repeat(121)},10));
});
test('comparison requires coverage in both periods and does not divide by missing chat time or zero baseline',()=>{
 const base={seconds:3600,viewer_seconds:3600,average:100,chat_seconds:3600,messages:100,tokens:20,days:3};
 const result=comparePeriods([{...base,period:0,average:150},{...base,period:1}]);assert.equal(result.viewerChange,50);assert.deepEqual(result.messageRates,[100,100]);
 assert.equal(comparePeriods([{...base,period:0},{...base,period:1,days:1}]).viewerChange,null);
 assert.equal(comparePeriods([{...base,period:0},{...base,period:1,average:0}]).viewerChange,null);
 assert.deepEqual(comparePeriods([]).messageRates,[null,null]);
});
