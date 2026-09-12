import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceRelay} from './source-relay.js';

test('expired playlist resolves again; segments and ranges use refreshed headers',async()=>{
 const calls=[];let refreshed=0;
 const relay=await createSourceRelay({url:'https://cdn.example/expired.m3u8',pageUrl:'https://example/old'},{
  refresh:async()=>{refreshed++;return {url:'https://cdn.example/current.m3u8',pageUrl:'https://example/current'};},
  fetcher:async(url,options)=>{calls.push({url,options});
   if(url.endsWith('expired.m3u8'))return new Response('',{status:403});
   if(url.endsWith('current.m3u8'))return new Response('#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:20\n#EXTINF:2,\nhttps://cdn.example/chunk.ts?existing=value\n');
   return new Response('abc',{status:206,headers:{'Content-Range':'bytes 0-2/10','Content-Type':'video/mp2t'}});
  }
 });
 try{
  const body=await(await fetch(relay.url)).text();const url=body.split('\n').find(l=>l.startsWith('http'));
  assert.ok(url.startsWith('http://127.0.0.1:'));assert.equal(refreshed,1);
  const response=await fetch(url,{headers:{Range:'bytes=0-2'}});assert.equal(response.status,206);assert.equal(await response.text(),'abc');
  assert.equal(calls.at(-1).url,'https://cdn.example/chunk.ts?existing=value');
  assert.equal(calls.at(-1).options.headers.Referer,'https://example/current');assert.equal(calls.at(-1).options.headers.Range,'bytes=0-2');
  await fetch(relay.url);assert.equal(refreshed,1);
 }finally{relay.close();}
 assert.equal((await fetch(relay.url)).status,404);
});

test('closing during refresh prevents renewed requests and releases resources',async()=>{
 let resolveRefresh,started;const ready=new Promise(r=>started=r);let reads=0;
 const relay=await createSourceRelay({url:'https://cdn.example/expired.m3u8'},{fetcher:async()=>{reads++;return new Response('',{status:403});},refresh:()=>{started();return new Promise(r=>resolveRefresh=r);}});
 const response=fetch(relay.url);await ready;relay.close();resolveRefresh({url:'https://cdn.example/new.m3u8'});
 assert.equal((await response).status,502);assert.equal(reads,1);assert.deepEqual(relay.stats(),{resources:0,closed:true});
});

test('transient playlist and segment failures retry without changing range or credentials',async()=>{
 let playlists=0,segments=0;
 const relay=await createSourceRelay({url:'https://cdn.example/live.m3u8',pageUrl:'https://example/Alice'},{fetcher:async(url,options)=>{
 if(url.endsWith('m3u8')){if(++playlists===1)return new Response('',{status:503});return new Response('#EXTM3U\n#EXTINF:2,\nchunk.ts\n');}
 assert.equal(options.headers.Range,'bytes=0-2');if(++segments===1)throw new TypeError('connection reset');return new Response('abc',{status:206});
 }});
 try{const body=await(await fetch(relay.url)).text();const segment=body.split('\n').find(l=>l.startsWith('http'));assert.equal(await(await fetch(segment,{headers:{Range:'bytes=0-2'}})).text(),'abc');assert.equal(playlists,2);assert.equal(segments,2);}finally{relay.close();}
});
test('authorization failures are not retried as transient segment failures',async()=>{
 let calls=0;const relay=await createSourceRelay({url:'https://cdn.example/live.m3u8'},{fetcher:async()=>{calls++;return new Response('',{status:403});}});
 try{assert.equal((await fetch(relay.url)).status,502);assert.equal(calls,1);}finally{relay.close();}
});
