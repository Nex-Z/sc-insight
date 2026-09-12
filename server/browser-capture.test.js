import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {BrowserMediaCapture,classify,manifestInfo} from './browser-capture.js';
import {captureInputArgs} from './capture-input.js';

test('recognizes extension, signed URLs and MIME-only media; excludes non-HTTP',()=>{
 for(const [url,mime,kind] of [['https://example.org/A.M3U8?token=x','','HLS'],['https://example.org/a.mpd','','DASH'],['https://example.org/a.ts','','segment'],['https://example.org/a.m4s','','segment'],['https://example.org/play','video/mp4','video'],['https://example.org/play','audio/aac','audio'],['https://example.org/play','application/vnd.apple.mpegurl; charset=utf-8','HLS']])assert.equal(classify(url,mime).kind,kind);
 assert.equal(classify('blob:https://example.org/id','video/mp4'),null);assert.equal(classify('https://example.org/image','image/png'),null);
});
function fixture(){const capture=new BrowserMediaCapture(),page=new EventEmitter();page.url=()=> 'https://example.org';page.title=async()=> 'Test';page.mainFrame=()=>page;return {capture,page};}
async function response(capture,page,{url='https://example.org/master.m3u8',method='GET',status=200,mime='application/vnd.apple.mpegurl',headers={cookie:'session=existing',referer:'https://example.org/',authorization:'Bearer existing'}}={}){
 const request={isNavigationRequest:()=>false,method:()=>method,allHeaders:async()=>headers};page.emit('request',request);
 await capture.observe([...capture.pages.values()][0],{request:()=>request,url:()=>url,status:()=>status,allHeaders:async()=>({'content-type':mime})});
}
test('captures existing headers, ranks manifests, deduplicates and rejects non-recordable selections',async()=>{
 const {capture,page}=fixture();await capture.watch(page);
 await response(capture,page);await response(capture,page);await response(capture,page,{url:'https://example.org/part.ts'});await response(capture,page,{url:'https://example.org/fail.m3u8',status:403});await response(capture,page,{url:'https://example.org/post.m3u8',method:'POST'});
 const snapshot=capture.snapshot().pages[0];assert.equal(snapshot.candidates.length,4);assert.equal(snapshot.candidates[0].count,2);assert.equal(snapshot.recommendedId,snapshot.candidates[0].id);
 assert.equal(JSON.stringify(snapshot).includes('Bearer existing'),false);assert.equal(JSON.stringify(snapshot).includes('session=existing'),false);
 assert.equal(capture.select(snapshot.id,snapshot.recommendedId).cookies,'session=existing');
 for(const c of snapshot.candidates.slice(1))assert.throws(()=>capture.select(snapshot.id,c.id));
 await capture.refresh(snapshot.id);assert.equal(capture.snapshot().pages[0].candidates.length,0);assert.throws(()=>capture.select(snapshot.id,snapshot.recommendedId));
});
test('late responses from previous navigation cannot repopulate candidates',async()=>{
 const {capture,page}=fixture();await capture.watch(page);let release;
 const request={isNavigationRequest:()=>false,method:()=> 'GET',allHeaders:()=>new Promise(r=>release=r)};page.emit('request',request);
 const state=[...capture.pages.values()][0];const pending=capture.observe(state,{request:()=>request,url:()=> 'https://example.org/a.m3u8',status:()=>200,allHeaders:async()=>({})});
 await new Promise(r=>setImmediate(r));state.reset();release({});await pending;assert.equal(state.candidates.size,0);
});
test('ffmpeg header replay preserves observed credentials and rejects injection',()=>{
 const args=captureInputArgs({method:'GET',url:'https://example.org/a.m3u8',headers:{'user-agent':'Browser UA',referer:'https://example.org/',cookie:'session=existing; mode=normal',authorization:'Bearer existing',range:'bytes=0-',host:'example.org'}});
 assert.ok(args.includes('Browser UA'));assert.ok(args.includes('Authorization: Bearer existing\r\n')||args.includes('authorization: Bearer existing\r\n'));assert.ok(args.includes('session=existing; path=/; domain=example.org;\nmode=normal; path=/; domain=example.org;'));assert.equal(args.join(' ').includes('bytes=0-'),false);
 assert.throws(()=>captureInputArgs({method:'GET',url:'https://example.org',headers:{authorization:'a\r\nInjected: b'}}));assert.throws(()=>captureInputArgs({method:'POST'}));
 assert.ok(captureInputArgs({method:'GET',url:'http://127.0.0.1:8123/a',headers:{cookie:'session=existing'}}).includes('session=existing; path=/; domain=127.0.0.1:8123;'));
});
test('master playlists outrank variants; DRM manifests are identified without license requests',()=>{
 assert.equal(manifestInfo('HLS','#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\na.m3u8').score,120);
 assert.equal(manifestInfo('HLS','#EXT-X-KEY:METHOD=SAMPLE-AES,URI="license"').protectedMedia,true);
 assert.equal(manifestInfo('DASH','<MPD><ContentProtection schemeIdUri="urn:uuid:test"/></MPD>').protectedMedia,true);
 assert.equal(manifestInfo('HLS','#EXT-X-KEY:METHOD=AES-128,KEYFORMAT="identity"').protectedMedia,false);
});
test('long playback retains main playlist and closing a tab removes its session',async()=>{
 const {capture,page}=fixture();await capture.watch(page);await response(capture,page);
 const first=capture.snapshot().pages[0];
 for(let i=0;i<305;i++)await response(capture,page,{url:`https://example.org/${i}.ts`,mime:'video/mp2t'});
 assert.equal(capture.snapshot().pages[0].candidates.length,300);assert.equal(capture.snapshot().pages[0].recommendedId,first.recommendedId);
 page.emit('close');assert.equal(capture.snapshot().pages.length,0);assert.throws(()=>capture.select(first.id,first.recommendedId));
});
