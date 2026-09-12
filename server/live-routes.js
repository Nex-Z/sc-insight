import express from 'express';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {pool} from './db.js';
import {resolveModelInput} from './model-source.js';
import {connectLiveChat} from './live-chat.js';
export const liveRoutes=express.Router();
const sessions=new Map();let pending=0;
function close(id){const s=sessions.get(id);if(s){sessions.delete(id);s.abort.abort();s.chatClose?.();s.chatResponse?.end();s.input.close();}}
setInterval(()=>{for(const [id,s]of sessions)if(Date.now()-s.seen>90000)close(id);},15000).unref();
liveRoutes.post('/live',async(req,res)=>{
 if(sessions.size+pending>=8)return res.status(429).json({error:'同时观看人数已达上限，请关闭不用的播放器'});
 if(!Number.isInteger(req.body.model_id)||req.body.model_id<1)return res.status(400).json({error:'请选择主播'});
 pending++;
 try{
  const {rows:[model]}=await pool.query('SELECT * FROM models WHERE id=$1',[req.body.model_id]);if(!model)return res.status(404).json({error:'主播不存在'});
  const input=await resolveModelInput(model);if(res.destroyed){input.close();return;}
  const id=randomUUID();sessions.set(id,{input,model,seen:Date.now(),abort:new AbortController()});
  res.status(201).json({id,url:`/api/live/${id}/media/index.m3u8`,chat:`/api/live/${id}/chat`});
 }catch{res.status(422).json({error:'直播暂不可播放：主播可能已下线或不在公开直播，请重试或前往官网'});}finally{pending--;}
});
liveRoutes.delete('/live/:id',(req,res)=>{close(req.params.id);res.json({ok:true});});
liveRoutes.get('/live/:id/media/:resource',async(req,res)=>{
 const s=sessions.get(req.params.id);if(!s)return res.status(404).end();s.seen=Date.now();
 const resource=req.params.resource;if(!/^(index\.m3u8|[a-f0-9]{64}\.(ts|m4s|mp4|aac|mp3|key))$/.test(resource))return res.status(400).end();
 const abort=new AbortController();res.on('close',()=>abort.abort());
 try{
  const r=await fetch(new URL(resource,s.input.url),{headers:req.headers.range?{Range:req.headers.range}:{},signal:AbortSignal.any([s.abort.signal,abort.signal,AbortSignal.timeout(25000)])});
  res.status(r.status);res.set('Cache-Control','no-store');
  if(resource==='index.m3u8'){const body=await r.text();res.type('application/vnd.apple.mpegurl').send(body.replaceAll(new URL('.',s.input.url).href,`/api/live/${req.params.id}/media/`));}
  else{for(const name of ['content-type','content-length','content-range','accept-ranges'])if(r.headers.has(name))res.set(name,r.headers.get(name));const stream=Readable.fromWeb(r.body);stream.on('error',()=>res.destroy());stream.pipe(res);}
 }catch{if(!res.headersSent)res.status(502).end();else res.destroy();}
});
liveRoutes.get('/live/:id/chat',async(req,res)=>{
 const s=sessions.get(req.params.id);if(!s)return res.status(404).end();
 s.chatClose?.();s.chatResponse?.end();s.chatResponse=res;
 res.set({'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});res.flushHeaders();
 const emit=(event,data)=>{if(!res.destroyed)res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);};
 const timer=setInterval(()=>{res.write(': keepalive\n\n');},15000);
 let ended=false,stop;res.on('close',()=>{ended=true;clearInterval(timer);stop?.();});
 emit('status',{text:'正在连接公开聊天室…'});
 try{stop=await connectLiveChat(s.model,emit);if(ended||!sessions.has(req.params.id))stop();else s.chatClose=stop;}catch{emit('status',{text:'公开聊天暂不可用，请重试或前往官网'});}
});
