import express from 'express';
import {browserCapture} from './browser-capture.js';
import {createBrowserRecording} from './recorder.js';
export function createBrowserRoutes(capture=browserCapture,record=createBrowserRecording){
 const router=express.Router();
 router.use((req,res,next)=>{
  res.set('Cache-Control','no-store');
  const remote=req.socket.remoteAddress;
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote))return res.status(403).json({error:'浏览器会话仅允许本机访问'});
  const host=req.headers.host?.split(':')[0];
  if(!['localhost','127.0.0.1','['].includes(host))return res.status(403).json({error:'无效的本机主机名'});
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'不允许跨站访问浏览器会话'});}catch{return res.sendStatus(403);}}
  if(req.headers['sec-fetch-site']==='cross-site')return res.sendStatus(403);
  next();
 });
 const handle=fn=>async(req,res)=>{try{res.json(await fn(req));}catch(e){res.status(400).json({error:e.message});}};
 router.get('/',handle(()=>capture.snapshot()));
 router.post('/connect',handle(req=>capture.connect(req.body)));
 router.post('/disconnect',handle(async()=>{await capture.disconnect();return {ok:true};}));
 router.post('/pages/:id/refresh',handle(req=>capture.refresh(req.params.id,req.body.reload===true)));
 router.post('/record',handle(req=>record(capture.select(req.body.pageId,req.body.candidateId),req.body.max_seconds)));
 return router;
}
export const browserRoutes=createBrowserRoutes();
