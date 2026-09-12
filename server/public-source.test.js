import test from 'node:test';
import assert from 'node:assert/strict';
import {readInitialState,sourceFromState,resolvePublicSource,inspectPublicRoom} from './public-source.js';
const fixture=()=>({viewCamBase:{model:{id:1,username:'PublicModel',status:'public',streamName:'1'}},viewCam:{streamName:'1',isCamAvailable:true},configV3:{initialCommon:{hlsStreamHost:'example.org',hlsStreamUrlTemplate:'https://edge-hls.{cdnHost}/hls/{streamName}/master/{streamName}{suffix}.m3u8'}}});
test('parses SSR JSON without evaluating page scripts',()=>{
 const data=fixture();data.note='quoted " and braces } ]';assert.deepEqual(readInitialState(`window.__PRELOADED_STATE__ = ${JSON.stringify(data)}; throw new Error('must never execute')`),data);
 assert.throws(()=>readInitialState('window.__PRELOADED_STATE__ = evil()'));assert.throws(()=>readInitialState('window.__PRELOADED_STATE__ = {'));
});
test('only resolves the intended accessible public model and validates the returned template',()=>{
 assert.equal(sourceFromState(fixture(),'PublicModel').url,'https://edge-hls.example.org/hls/1/master/1_auto.m3u8');
 assert.throws(()=>sourceFromState(fixture(),'DifferentModel'));
 for(const status of ['private','offline','groupShow']){const data=fixture();data.viewCamBase.model.status=status;assert.throws(()=>sourceFromState(data,'PublicModel'));}
 const blocked=fixture();blocked.viewCamBase.model.isBlocked=true;assert.throws(()=>sourceFromState(blocked,'PublicModel'));
 const wrongHost=fixture();wrongHost.configV3.initialCommon.hlsStreamUrlTemplate='http://127.0.0.1/secret';assert.throws(()=>sourceFromState(wrongHost,'PublicModel'));
});
test('HTTP-only discovery never starts a browser or marks unprobed media ready',async()=>{
 const requests=[];const fetcher=async(url,options)=>{requests.push({url,options});return new Response(requests.length===1?`window.__PRELOADED_STATE__ = ${JSON.stringify(fixture())};`:'#EXTM3U\n#EXT-X-MOUFLON:custom\n#EXT-X-STREAM-INF:BANDWIDTH=1\nchild.m3u8');};
 const result=await resolvePublicSource('PublicModel',{fetcher});assert.equal(requests.length,2);assert.equal(result.transport,'http');assert.equal(result.status,'unsupported_manifest');assert.equal(result.recordable,false);assert.equal(result.mode,undefined);
 for(const {options} of requests){assert.equal(options.headers.Cookie,undefined);assert.equal(options.headers.Authorization,undefined);}
});
test('rejects bad responses and invalid names without generating fallback URLs',async()=>{
 await assert.rejects(resolvePublicSource('../other'));await assert.rejects(resolvePublicSource('PublicModel',{fetcher:async()=>new Response('',{status:403})}),/403/);
});

test('off is confirmed offline; unknown statuses are still rejected',async()=>{const data=fixture();data.viewCamBase.model.status='off';const fetcher=async()=>new Response('window.__PRELOADED_STATE__ = '+JSON.stringify(data));const room=await inspectPublicRoom('PublicModel',{fetcher});assert.equal(room.status,'offline');assert.equal(room.live,false);data.viewCamBase.model.status='future-status';await assert.rejects(inspectPublicRoom('PublicModel',{fetcher}),/状态未知/);});
