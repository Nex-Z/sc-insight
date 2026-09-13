import {sourceUrl} from './media.js';
import {resolveLivePlaylist} from './live-manifest.js';
import {advertisedFormat,rewriteMouflon,bestVariant} from './mouflon.js';
import {classifyRoom} from '../src/room-state.js';

export function readInitialState(html){
 const marker='window.__PRELOADED_STATE__';const at=html.indexOf(marker);
 if(at<0)throw new Error('公开页面缺少主播数据');
 const assignment=html.slice(at+marker.length).match(/^\s*=\s*/);
 if(!assignment)throw new Error('页面初始数据格式已变化');
 const start=at+marker.length+assignment[0].length;
 if(html[start]!=='{')throw new Error('页面初始数据不是 JSON');
 let depth=0,quoted=false,escaped=false;
 for(let i=start;i<html.length;i++){
  const c=html[i];
  if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
  if(c==='"')quoted=true;else if(c==='{'||c==='[')depth++;else if(c==='}'||c===']'){if(--depth===0){try{return JSON.parse(html.slice(start,i+1));}catch{throw new Error('页面初始 JSON 无效');}}}
 }
 throw new Error('页面初始数据不完整');
}
export function sourceFromState(state,expectedName){
 const model=state.viewCamBase?.model,cam=state.viewCam,config=state.configV3?.initialCommon;
 if(!model||model.username?.toLowerCase()!==expectedName.toLowerCase())throw new Error('直播间与目标主播不匹配');
 if(model.status!=='public'||model.isBlocked||model.isDeleted||cam?.isCamAvailable!==true)throw new Error('主播当前不是可访问的公开直播');
 const stream=String(cam.streamName||model.streamName||'');
 if(!/^[\w-]{1,100}$/.test(stream))throw new Error('主播流标识不可用');
 if(typeof config?.hlsStreamUrlTemplate!=='string'||!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(config.hlsStreamHost||''))throw new Error('公开页面没有有效播放器配置');
 const url=sourceUrl(config.hlsStreamUrlTemplate.replaceAll('{cdnHost}',config.hlsStreamHost).replaceAll('{streamName}',stream).replaceAll('{suffix}','_auto'));
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||parsed.hostname!==`edge-hls.${config.hlsStreamHost}`||/[{}]/.test(url))throw new Error('播放器地址模板已变化');
 return {name:model.username,streamName:stream,modelId:String(model.id),url};
}
async function readBounded(response,max){
 const reader=response.body?.getReader();if(!reader)throw new Error('上游没有返回内容');
 let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new Error('上游响应过大');chunks.push(value);}return Buffer.concat(chunks).toString('utf8');}finally{await reader.cancel().catch(()=>{});}
}
export async function inspectPublicRoom(name,{fetcher=fetch}={}){
 if(typeof name!=='string'||! /^[\w-]{1,80}$/.test(name))throw new Error('主播名称无效');
 const response=await fetcher(`https://stripchat.com/${encodeURIComponent(name)}`,{headers:{Accept:'text/html'},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(`公开直播间请求失败（HTTP ${response.status}）`);
 const state=readInitialState(await readBounded(response,4*1024*1024)),model=state.viewCamBase?.model;
 if(model?.username?.toLowerCase()!==name.toLowerCase()||!/^\d+$/.test(String(model?.id)))throw new Error('直播间身份无法确认');

 if(!['public','off','offline','idle','private','groupShow','p2p','away'].includes(model.status))throw new Error('直播状态未知，保留现有任务');
 if(model.status==='public'&&typeof state.viewCam?.isCamAvailable!=='boolean')throw new Error('直播可用状态未知，保留现有任务');
 const room=classifyRoom(model,state.viewCam,'room-page');return {...room,name:model.username,modelId:String(model.id),live:room.recordable};
}
export async function resolvePublicSource(name,{fetcher=fetch}={}){
 if(typeof name!=='string'||! /^[\w-]{1,80}$/.test(name))throw new Error('主播名称无效');
 const pageUrl=`https://stripchat.com/${encodeURIComponent(name)}`;
 const response=await fetcher(pageUrl,{headers:{Accept:'text/html'},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(`公开直播间请求失败（HTTP ${response.status}）`);
 const source=sourceFromState(readInitialState(await readBounded(response,4*1024*1024)),name);
 const manifestResponse=await fetcher(source.url,{headers:{Referer:pageUrl,Accept:'application/vnd.apple.mpegurl'},signal:AbortSignal.timeout(15000)});
 if(!manifestResponse.ok)throw new Error(`主清单请求失败（HTTP ${manifestResponse.status}）`);
 const manifest=await readBounded(manifestResponse,512*1024);
 if(!manifest.trimStart().startsWith('#EXTM3U'))throw new Error('返回内容不是有效 HLS');
 if(/METHOD=SAMPLE-AES|KEYFORMAT="(?!identity")/i.test(manifest))throw new Error('检测到受保护媒体，不支持录制');
 const customManifest=manifest.includes('#EXT-X-MOUFLON');
 if(customManifest){
  const format=advertisedFormat(manifest);
  if(format){
   const variant=new URL(bestVariant(manifest,manifestResponse.url||source.url));
   variant.searchParams.set('psch',format.scheme);variant.searchParams.set('pkey',format.id);
   variant.searchParams.set('playlistType','lowLatency');
   const response=await fetcher(variant.href,{headers:{Referer:pageUrl},signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error(`直播清单请求失败（HTTP ${response.status}）`);
   rewriteMouflon(await readBounded(response,512*1024),format,response.url||variant.href);
   return {...source,url:variant.href,pageUrl,formatId:format.id,transport:'http',status:'resolved',recordable:false,reason:'已解析真实直播分片，开录前将验证媒体轨道',resolvedAt:new Date().toISOString()};
  }
 }
 if(!customManifest)source.url=await resolveLivePlaylist(source.url,{Referer:pageUrl,Accept:'application/vnd.apple.mpegurl'},{fetcher});
 return {...source,pageUrl,transport:'http',status:customManifest?'unsupported_manifest':'resolved',recordable:false,reason:customManifest?'当前 HTTP 适配器尚不支持此自定义分片格式，未启动录制':'已解析主清单，尚需媒体探测',resolvedAt:new Date().toISOString()};
}
