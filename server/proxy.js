import {Agent,EnvHttpProxyAgent,setGlobalDispatcher} from 'undici';
import {pool} from './db.js';
import express from 'express';
let current={enabled:false,url:''},dispatcher;
export function validateProxy(value){
 if(typeof value?.enabled!=='boolean')throw Error('请选择是否启用代理');
 const url=String(value.url||'').trim();if(!value.enabled)return {enabled:false,url};
 let u;try{u=new URL(url);}catch{throw Error('请输入有效 HTTP / HTTPS 代理地址');}
 if(!['http:','https:'].includes(u.protocol)||!u.hostname||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('代理需为 HTTP / HTTPS 地址，暂不支持账号密码');
 return {enabled:true,url:u.origin};
}
function apply(value){
 const previous=dispatcher;current=value;
 if(value.enabled){process.env.HTTP_PROXY=value.url;process.env.HTTPS_PROXY=value.url;}else{delete process.env.HTTP_PROXY;delete process.env.HTTPS_PROXY;delete process.env.http_proxy;delete process.env.https_proxy;}
 process.env.NO_PROXY='localhost,127.0.0.1,::1,db';
 dispatcher=value.enabled?new EnvHttpProxyAgent({httpProxy:value.url,httpsProxy:value.url,noProxy:process.env.NO_PROXY}):new Agent();setGlobalDispatcher(dispatcher);if(previous)void previous.close().catch(()=>{});
}
export async function loadProxy(){const r=await pool.query("SELECT value FROM settings WHERE key='network_proxy'");if(r.rowCount)apply(validateProxy(r.rows[0].value));}
export const proxyRoutes=express.Router();
proxyRoutes.get('/proxy',(req,res)=>res.json(current));
proxyRoutes.put('/proxy',async(req,res)=>{try{const value=validateProxy(req.body);await pool.query("INSERT INTO settings(key,value) VALUES('network_proxy',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[value]);apply(value);res.json({...current,message:'已保存；新请求立即生效，已有录制连接在重连后使用新代理'});}catch(e){res.status(400).json({error:e.message});}});
proxyRoutes.post('/proxy/test',async(req,res)=>{try{const r=await fetch('https://stripchat.com/api/front/v2/models?limit=24&offset=0&primaryTag=girls',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});await r.body?.cancel();res.json({ok:r.ok,status:r.status,message:r.ok?'平台连接正常':`平台返回 HTTP ${r.status}`});}catch(e){res.json({ok:false,message:'连接失败：'+(e.cause?.code||e.name)});}});
