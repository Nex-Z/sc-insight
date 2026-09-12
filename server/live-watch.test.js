import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileLiveTarget} from './live-watch.js';
import {inspectPublicRoom} from './public-source.js';
import {bestVariant} from './mouflon.js';

test('offline waits, online starts once, offline stops, next online starts again',async()=>{
 let live=false,tasks=[],starts=0,stops=0;
 const options={inspect:async()=>({modelId:'123',live}),observe:async()=>{},active:async()=>tasks,eligible:async()=>true,start:async()=>{starts++;tasks=[{id:starts}];},stop:async()=>{stops++;tasks=[];}};
 const model={name:'Alice',source_id:'123'};
 await reconcileLiveTarget(model,options);assert.equal(starts,0);
 live=true;await reconcileLiveTarget(model,options);await reconcileLiveTarget(model,options);assert.equal(starts,1);
 live=false;await reconcileLiveTarget(model,options);assert.equal(stops,1);
 live=true;await reconcileLiveTarget(model,options);assert.equal(starts,2);
 await assert.rejects(reconcileLiveTarget(model,{...options,inspect:async()=>{throw Error('timeout');}}));assert.equal(stops,1);
 await assert.rejects(reconcileLiveTarget(model,{...options,inspect:async()=>({modelId:'wrong',live:false})}),/ID/);assert.equal(stops,1);
});

test('offline can be registered without resolving media; HTTP errors are not offline',async()=>{
 const state={viewCamBase:{model:{id:123,username:'Alice',status:'offline'}}};
 const fetcher=async()=>new Response('window.__PRELOADED_STATE__ = '+JSON.stringify(state));
 assert.deepEqual(await inspectPublicRoom('Alice',{fetcher}),{name:'Alice',modelId:'123',status:'offline',live:false});
 await assert.rejects(inspectPublicRoom('Alice',{fetcher:async()=>new Response('',{status:503})}),/503/);
});

test('highest resolution then frame rate outrank a lower quality stream with higher bandwidth',()=>{
 const manifest='#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=9000000,RESOLUTION=1280x720,FRAME-RATE=60\n720.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080,FRAME-RATE=30\n1080.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080,FRAME-RATE=60\n1080-60.m3u8';
 assert.equal(bestVariant(manifest,'https://example/'),'https://example/1080-60.m3u8');
});

test('idle is a known unavailable room state, not an endless status error',async()=>{
 const state={viewCamBase:{model:{id:123,username:'Alice',status:'idle'}},viewCam:{isCamAvailable:false}};
 const room=await inspectPublicRoom('Alice',{fetcher:async()=>new Response('window.__PRELOADED_STATE__ = '+JSON.stringify(state))});assert.equal(room.status,'idle');assert.equal(room.live,false);
});
