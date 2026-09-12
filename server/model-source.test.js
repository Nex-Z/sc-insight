import test from 'node:test';
import assert from 'node:assert/strict';
import {findRecordingTarget,resolveModelInput} from './model-source.js';
import {resolveLivePlaylist} from './live-manifest.js';

test('target IDs refer to upstream IDs; names are case insensitive and input is bounded',async()=>{
 const calls=[];const db={query:async(sql,args)=>{calls.push({sql,args});return {rows:[{id:7,name:'Alice',source_id:'123'}]};}};
 assert.equal((await findRecordingTarget(db,'123')).id,7);
 assert.match(calls[0].sql,/source_id=\$1/);
 await findRecordingTarget(db,'alice');assert.match(calls[1].sql,/lower\(name\)/);
 assert.deepEqual(calls[1].args,['alice']);
 const empty={query:async()=>({rows:[]})};
 await assert.rejects(findRecordingTarget(empty,'123'),/尚未收录/);
 assert.deepEqual(await findRecordingTarget(empty,'NewModel'),{name:'NewModel'});
 await assert.rejects(findRecordingTarget(db,'../../x'));
 await assert.rejects(findRecordingTarget(db,'x'.repeat(81)));
});

test('model identity and unsupported manifests are checked before probing',async()=>{
 const source={modelId:'123',name:'Alice',status:'resolved',url:'https://cdn.example/live.m3u8',pageUrl:'https://example/Alice'};
 const calls=[];const prober=async(...args)=>calls.push(args);
 const model={name:'Alice',source_id:'123'};
 const input=await resolveModelInput(model,{resolver:async()=>source,prober});
 assert.equal(input.method,'GET');assert.equal(calls[0][2].headers.Referer,source.pageUrl);
 await assert.rejects(resolveModelInput(model,{resolver:async()=>({...source,modelId:'999'}),prober}),/ID/);
 await assert.rejects(resolveModelInput(model,{resolver:async()=>({...source,status:'unsupported_manifest',reason:'custom'}),prober}),/custom/);
 assert.equal(calls.length,1);input.close();
});

test('refresh remains bound to the first upstream identity and failed probes close the relay',async()=>{
 let refresh,calls=0,closed=0;
 const resolver=async()=>({status:'resolved',modelId:String(++calls),url:'https://cdn.example/live.m3u8',pageUrl:'https://example/Alice'});
 const relayFactory=async(source,options)=>{refresh=options.refresh;return {url:source.url,close:()=>closed++};};
 const input=await resolveModelInput({name:'Alice'},{resolver,relayFactory,prober:async()=>({streams:[]})});
 await assert.rejects(refresh(),/ID/);input.close();assert.equal(closed,1);
 await assert.rejects(resolveModelInput({name:'Alice'},{resolver,relayFactory,prober:async()=>{throw new Error('probe failed');}}),/probe failed/);
 assert.equal(closed,2);
});

test('live validation follows highest bandwidth original URI and preserves its query',async()=>{
 const calls=[];const fetcher=async(url,options)=>{
  calls.push({url,options});return new Response(calls.length===1?'#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=10\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=20\nhigh.m3u8?existing=value':'#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:10\n#EXTINF:2,\nreal_10.ts\n');
 };
 assert.equal(await resolveLivePlaylist('https://example/master.m3u8',{Referer:'https://example/'},{fetcher}),'https://example/high.m3u8?existing=value');
 assert.equal(calls[1].options.headers.Referer,'https://example/');
});

test('live validation rejects fallback clips, DRM, custom formats and recursive masters',async()=>{
 for(const body of ['#EXTM3U\n#EXT-X-ENDLIST','#EXTM3U\n#EXT-X-MOUFLON:URI:opaque','#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key"','#EXTM3U\n#EXTINF:2,\n../media.mp4','#EXTM3U\n#EXTINF:2,\nhttps://cdn/cpa/v2/chunk.m4s','#EXTM3U']){
  await assert.rejects(resolveLivePlaylist('https://example/live.m3u8',{}, {fetcher:async()=>new Response(body)}));
 }
 let requests=0;await assert.rejects(resolveLivePlaylist('https://example/master.m3u8',{}, {fetcher:async()=>{requests++;return new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmaster.m3u8');}}),/嵌套/);assert.equal(requests,4);
});
