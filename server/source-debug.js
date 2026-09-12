import 'dotenv/config';
import {chromium} from 'playwright';
import {describeManifest,replayHeaders} from './manifest-diagnostics.js';
// Attach for diagnostics only. Does not open/navigate a tab or record playback.
const endpoint=process.argv[2]||'http://127.0.0.1:9222';
const parsed=new URL(endpoint);
if(parsed.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))throw new Error('仅允许连接本机 CDP');
let browser,timer,handler;const watched=[];
try{
 browser=await chromium.connectOverCDP(endpoint,{timeout:5000});
 watched.push(...browser.contexts().flatMap(c=>c.pages()));
 const response=await new Promise((resolve,reject)=>{
  handler=response=>{const url=new URL(response.url());if(url.pathname.endsWith('.m3u8')&&url.searchParams.has('_HLS_msn'))resolve(response);};
  watched.forEach(page=>page.on('response',handler));timer=setTimeout(()=>reject(new Error('25 秒内未发现直播 HLS 更新，请确认页面正在播放')),25000);
 });
 clearTimeout(timer);watched.forEach(page=>page.off('response',handler));
 const headers=await response.request().allHeaders(),body=await response.text();
 if(body.length>1024*1024)throw new Error('调试清单超过大小限制');
 const replay=await fetch(response.url(),{headers:replayHeaders(headers),signal:AbortSignal.timeout(15000)});
 const reader=replay.body.getReader();let length=0;const chunks=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>1024*1024)throw new Error('重放清单超过大小限制');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const replayBody=Buffer.concat(chunks).toString('utf8');
 const report={browser:describeManifest(body),httpReplay:{status:replay.status,...describeManifest(replayBody)},sameContent:body===replayBody,requestHeaderNames:Object.keys(headers).filter(k=>!k.startsWith(':')),queryParameterNames:[...new URL(response.url()).searchParams.keys()]};
 console.log(JSON.stringify(report,null,2));
 if(report.httpReplay.needsAddressAdapter||!replay.ok)process.exitCode=2;
}catch(e){console.error(e.message);process.exitCode=1;}
finally{clearTimeout(timer);watched.forEach(page=>page.off('response',handler));await browser?.close();}
