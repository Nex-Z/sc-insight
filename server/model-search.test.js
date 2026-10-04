import test from 'node:test';
import assert from 'node:assert/strict';
import {searchOfficialModels} from './model-search.js';
test('forwarded full-name searches use a prefix and exclude unrelated names',async()=>{
 const queries=[];
 const result=await searchOfficialModels('su456711',{fetcher:async url=>{
  const query=url.searchParams.get('query');queries.push(query);
  return Response.json(query==='su456711'?{groups:null,fw:true}:{groups:{username:{totalCount:3,models:[{id:278233305,username:'su456711',status:'public'},{id:2,username:'su456_other'},{id:278233305,username:'su456711'}]}}});
 }});
 assert.deepEqual(queries,['su456711','su456']);
 assert.equal(result.total,1);assert.equal(result.models.length,1);
 assert.equal(result.models[0].source_id,'278233305');
});
test('null forwarding results can be empty, but malformed fallback responses still fail',async()=>{
 let calls=0;
 const result=await searchOfficialModels('missing',{fetcher:async()=>{calls++;return Response.json({groups:null,fw:true});}});
 assert.equal(result.total,0);assert.deepEqual(result.models,[]);assert.equal(calls,3);
 await assert.rejects(searchOfficialModels('missing',{fetcher:async url=>Response.json(url.searchParams.get('query')==='missing'?{groups:null,fw:true}:{})}),/结构/);
 await assert.rejects(searchOfficialModels('missing',{fetcher:async()=>Response.json({groups:null})}),/结构/);
});
test('malformed individual identities do not discard valid search results',async()=>{
 const result=await searchOfficialModels('fixture',{fetcher:async()=>Response.json({groups:{username:{totalCount:6,models:[null,{id:0,username:'invalid'},{id:123,username:'valid_name'},{id:456,username:'../bad'},{id:789},{id:123,username:'valid_name'}]}}})});
 assert.equal(result.models.length,1);assert.equal(result.models[0].source_id,'123');assert.equal(result.skipped,4);assert.equal(result.total,6);
});
test('official username group supports offline names and ignores unrelated recommendations',async()=>{
 const result=await searchOfficialModels(' a&b ',{fetcher:async url=>{
  assert.equal(url.searchParams.get('query'),'a&b');assert.equal(url.searchParams.get('primaryTag'),'girls');
  return Response.json({groups:{username:{totalCount:7,models:[{id:123,username:'Offline_Name',status:'',isOnline:false}]},topic:{models:[{id:5,username:'Unrelated'}]}}});
 }});
 assert.equal(result.total,7);assert.equal(result.models.length,1);assert.equal(result.models[0].source_id,'123');assert.equal(result.models[0].fresh,false);
});
test('empty results are distinct from HTTP or schema errors; blank queries never fetch',async()=>{
 assert.deepEqual((await searchOfficialModels('missing',{fetcher:async()=>Response.json({groups:{username:{models:[],totalCount:0}}})})).models,[]);
 await assert.rejects(searchOfficialModels('x',{fetcher:async()=>new Response('',{status:429})}),/429/);
 await assert.rejects(searchOfficialModels('x',{fetcher:async()=>Response.json({})}),/结构/);
 await assert.rejects(searchOfficialModels(' ',{fetcher:()=>assert.fail('must not fetch')}));
});
