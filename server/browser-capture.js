import {chromium} from 'playwright';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

export function classify(url, mime='') {
 let pathname;try {pathname=new URL(url).pathname.toLowerCase();if(!/^https?:/.test(url))return null;}catch{return null;}
 mime=mime.split(';')[0].toLowerCase();
 if(/\.(ts|m4s)$/.test(pathname))return {kind:'segment',score:10};
 if(pathname.endsWith('.m3u8')||/mpegurl/.test(mime))return {kind:'HLS',score:100};
 if(pathname.endsWith('.mpd')||mime==='application/dash+xml')return {kind:'DASH',score:95};
 if(/\.(ts|m4s)$/.test(pathname)||mime==='video/mp2t')return {kind:'segment',score:10};
 if(mime.startsWith('video/'))return {kind:'video',score:75};
 if(mime.startsWith('audio/'))return {kind:'audio',score:45};
 return null;
}
export function manifestInfo(kind,body='') {
 const protectedMedia=kind==='DASH'?/<(?:\w+:)?ContentProtection\b/i.test(body):/METHOD=SAMPLE-AES|KEYFORMAT="(?!identity")/i.test(body);
 const master=kind==='HLS'&&/#EXT-X-STREAM-INF:/.test(body);
 return {protectedMedia,master,...(master?{score:120}:{})};
}
export class BrowserMediaCapture {
 constructor(){this.pages=new Map();this.browser=null;this.context=null;this.connecting=false;this.mode=null;this.error=null;}
 async connect({browser='msedge',endpoint='http://127.0.0.1:9222'}={}) {
  if(this.context)return this.snapshot();
  if(this.connecting)throw new Error('浏览器正在连接');
  if(!['msedge','chrome','chromium'].includes(browser))throw new Error('请选择 Chromium、Chrome 或 Edge');
  const u=new URL(endpoint);if(u.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password)throw new Error('CDP 地址必须是本机 HTTP 地址');
  this.connecting=true;
  try {
   try {this.browser=await chromium.connectOverCDP(endpoint,{timeout:2500});this.context=this.browser.contexts()[0];this.mode='attached';}
   catch {this.context=await chromium.launchPersistentContext(path.resolve('storage','browser-profiles',browser),{headless:false,...(browser==='chromium'?{}:{channel:browser}),ignoreDefaultArgs:['--mute-audio']});this.mode='launched';}
   this.context.on('page',this.onPage=page=>void this.watch(page));
   this.context.on('close',()=>{this.context=null;this.pages.clear();});
   if(this.browser)this.browser.on('disconnected',()=>{this.context=null;this.pages.clear();});
   for(const page of this.context.pages())await this.watch(page);
   if(!this.context.pages().length)await this.context.newPage();
   this.error=null;return this.snapshot();
  } catch {this.context=null;throw new Error('无法连接或启动浏览器。请安装 Edge / Chrome，或运行 npx playwright install chromium。');}
  finally {this.connecting=false;}
 }
 async watch(page) {
  if([...this.pages.values()].some(p=>p.page===page))return;
  const state={id:randomUUID(),page,url:page.url(),title:'',generation:0,candidates:new Map(),pending:new Map()};this.pages.set(state.id,state);
  const reset=()=>{state.generation++;state.candidates.clear();state.pending.clear();state.url=page.url();};
  state.reset=reset;
  state.listeners={
   request:request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())reset();state.pending.set(request,state.generation);if(state.pending.size>2000)state.pending.delete(state.pending.keys().next().value);},
   requestfailed:request=>state.pending.delete(request),
   response:response=>{void this.observe(state,response).catch(()=>{});},
   framenavigated:frame=>{if(frame===page.mainFrame()){state.url=page.url();void page.title().then(t=>state.title=t).catch(()=>{});}},
   close:()=>this.pages.delete(state.id)
  };
  for(const [event,listener] of Object.entries(state.listeners))page.on(event,listener);
  state.title=await page.title().catch(()=>'');
 }
 async observe(state,response) {
  const request=response.request(),generation=state.pending.get(request);state.pending.delete(request);
  if(generation==null)return;
  const responseHeaders=await response.allHeaders(),type=classify(response.url(),responseHeaders['content-type']);
  if(!type)return;
  const headers=await request.allHeaders();
  let manifest={};
  if(['HLS','DASH'].includes(type.kind)&&response.text){
   const body=await response.text().catch(()=>'');
   manifest=manifestInfo(type.kind,body.slice(0,524288));
  }
  if(state.generation!==generation||!this.pages.has(state.id))return;
  const url=response.url(),method=request.method(),key=method+' '+url;
  const previous=state.candidates.get(key),status=response.status();
  const candidate={id:previous?.id||randomUUID(),pageId:state.id,url,method,headers,referer:headers.referer||'',userAgent:headers['user-agent']||'',cookies:headers.cookie||'',contentType:responseHeaders['content-type']||'',...type,...manifest,status,recordable:method==='GET'&&status>=200&&status<300&&type.kind!=='segment'&&!manifest.protectedMedia,lastSeen:Date.now(),count:(previous?.count||0)+1};
  state.candidates.set(key,candidate);
  if(state.candidates.size>300){const expendable=[...state.candidates].find(([,c])=>c.kind==='segment');state.candidates.delete(expendable?.[0]||state.candidates.keys().next().value);}
 }
 snapshot() {
  return {connected:!!this.context,mode:this.mode,pages:[...this.pages.values()].map(p=>{
   const candidates=[...p.candidates.values()].sort((a,b)=>Number(b.recordable)-Number(a.recordable)||b.score-a.score||b.lastSeen-a.lastSeen);
   return {id:p.id,url:p.url,title:p.title,generation:p.generation,recommendedId:candidates.find(c=>c.recordable)?.id,candidates:candidates.map(({headers,cookies,...c})=>({...c,headerNames:Object.keys(headers),hasCookies:!!cookies}))};
  })};
 }
 select(pageId,candidateId) {
  const candidate=[...(this.pages.get(pageId)?.candidates.values()||[])].find(c=>c.id===candidateId);
  if(!candidate)throw new Error('媒体已失效，请重新选择');
  if(!candidate.recordable)throw new Error('只能录制成功的 GET 清单或完整媒体；分片不能单独作为主流');
  if(Date.now()-candidate.lastSeen>30*60*1000)throw new Error('媒体请求已过期，请刷新页面重新检测');
  return structuredClone(candidate);
 }
 async refresh(id,reload=false) {const state=this.pages.get(id);if(!state)throw new Error('页面已关闭');state.reset();if(reload)await state.page.reload({waitUntil:'domcontentloaded',timeout:20000});return this.snapshot();}
 async disconnect() {
  if(this.mode==='launched')await this.context?.close();
  else if(this.context){this.context.off('page',this.onPage);for(const p of this.pages.values())for(const [event,listener] of Object.entries(p.listeners))p.page.off(event,listener);await this.browser?.close();}
  this.pages.clear();this.context=null;this.mode=null;
 }
}
export const browserCapture=new BrowserMediaCapture();
