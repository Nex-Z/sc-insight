import http from 'node:http';
import {Readable} from 'node:stream';
import {randomUUID,createHash} from 'node:crypto';
import {sourceUrl} from './media.js';
import {setTimeout as delay} from 'node:timers/promises';
import {rewriteMouflon,formatById} from './mouflon.js';

const sessions=new Map();let listening;
// Retry before forwarding headers only; never append a second response to a partial segment.
async function fetchTransient(fetcher,url,options){
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetcher(url,options);
   if(![408,429,500,502,503,504].includes(response.status)||attempt===2)return response;
   await response.body?.cancel();
  }catch(error){if(options.signal.aborted||attempt===2)throw error;}
  await delay(250*(attempt+1),undefined,{signal:options.signal});
 }
}
async function relayPort(){
 if(!listening)listening=new Promise((resolve,reject)=>{
  const server=http.createServer(async(req,res)=>{
   const [,token,resource]=new URL(req.url,'http://localhost').pathname.split('/');
   const session=sessions.get(token);
   if(req.method!=='GET'||!session){res.writeHead(404).end();return;}
   try{await session.serve(resource,req,res);}catch{if(!res.headersSent)res.writeHead(502).end('Live source unavailable');else res.destroy();}
  });
  server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.unref();resolve(server.address().port);});
 });
 return listening;
}
async function playlistBody(response){
 if(!response.ok)throw new Error(`HTTP ${response.status}`);
 const reader=response.body.getReader();let bytes=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>512*1024)throw new Error('Playlist too large');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(chunks).toString('utf8');
}

export async function createSourceRelay(initial,{refresh,fetcher=fetch}={}){
 let source=initial,closed=false,loading,lastRefresh=0,cache,lastLoaded=0;
 const resources=new Map(),abort=new AbortController(),token=randomUUID();
 const port=await relayPort(),base=`http://127.0.0.1:${port}/${token}/`;
 function resourceUrl(url){
  url=sourceUrl(url);const id=createHash('sha256').update(url).digest('hex');
  const entry={url,headers:{Referer:source.pageUrl},time:Date.now()};resources.delete(id);resources.set(id,entry);
  while(resources.size>2048)resources.delete(resources.keys().next().value);
  const extension=new URL(url).pathname.match(/\.(mp4|m4s|ts|aac|mp3|key)$/i)?.[1]||'ts';
  return base+id+'.'+extension;
 }
 async function read(){
  const response=await fetchTransient(fetcher,source.url,{headers:{Referer:source.pageUrl},signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)])});
  let body=await playlistBody(response);
  if(source.formatId)body=rewriteMouflon(body,formatById(source.formatId),response.url||source.url);
  if(!body.startsWith('#EXTM3U')||body.includes('#EXT-X-ENDLIST')||body.includes('#EXT-X-MOUFLON'))throw new Error('Not a live media playlist');
  if(/METHOD=SAMPLE-AES|KEYFORMAT="(?!identity")/i.test(body))throw new Error('Protected media');
  const rewritten=body.split(/\r?\n/).map(line=>{
   if(line.trim()&&!line.trim().startsWith('#'))return resourceUrl(new URL(line.trim(),response.url||source.url).href);
   return line.replace(/URI="([^"]+)"/g,(_,uri)=>`URI="${resourceUrl(new URL(uri,response.url||source.url).href)}"`);
  }).join('\n');
  if(closed)throw new Error('Closed');return rewritten;
 }
 async function load(){
  if(cache&&Date.now()-lastLoaded<500)return cache;
  if(!loading)loading=(async()=>{
   try{return await read();}catch(error){
    if(closed||!refresh||Date.now()-lastRefresh<15000)throw error;
    lastRefresh=Date.now();const next=await refresh();
    if(closed)throw new Error('Closed');source=next;return await read();
   }
  })().then(body=>{cache=body;lastLoaded=Date.now();return body;}).finally(()=>{loading=null;});
  return loading;
 }
 const session={async serve(resource,req,res){
  res.setHeader('Cache-Control','no-store');
  if(resource==='index.m3u8'){const body=await load();res.setHeader('Content-Type','application/vnd.apple.mpegurl');res.end(body);return;}
  const entry=resources.get(resource?.split('.')[0]);if(!entry){res.writeHead(404).end();return;}
  const requestAbort=new AbortController();res.once('close',()=>requestAbort.abort());
  const headers={...entry.headers};if(req.headers.range)headers.Range=req.headers.range;
  const upstream=await fetchTransient(fetcher,entry.url,{headers,signal:AbortSignal.any([abort.signal,requestAbort.signal,AbortSignal.timeout(20000)])});
  if(!upstream.ok){await upstream.body?.cancel();throw new Error('Segment unavailable');}
  res.statusCode=upstream.status;
  for(const name of ['content-type','content-length','content-range','accept-ranges'])if(upstream.headers.has(name))res.setHeader(name,upstream.headers.get(name));
  await new Promise((resolve,reject)=>{const stream=Readable.fromWeb(upstream.body);stream.on('error',reject);res.on('finish',resolve);res.on('close',resolve);stream.pipe(res);});
 }};
 sessions.set(token,session);
 return {url:base+'index.m3u8',close(){closed=true;abort.abort();sessions.delete(token);resources.clear();},refresh:async()=>{cache=null;lastRefresh=Date.now();source=await refresh();},stats:()=>({resources:resources.size,closed})};
}
