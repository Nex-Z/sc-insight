import test from 'node:test';
import assert from 'node:assert/strict';
import {searchOfficialModels} from './model-search.js';
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
