import {sourceUrl} from './media.js';
import {rankVariant,highestQuality} from './quality.js';

export async function readManifest(url,headers,{fetcher=fetch}={}){
 const response=await fetcher(sourceUrl(url),{headers,signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(`直播清单请求失败（HTTP ${response.status}）`);
 const reader=response.body.getReader();let bytes=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>512*1024)throw new Error('直播清单过大');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const body=Buffer.concat(chunks).toString('utf8');
 if(!body.trimStart().startsWith('#EXTM3U'))throw new Error('返回内容不是 HLS 清单');
 if(/METHOD=SAMPLE-AES|KEYFORMAT="(?!identity")/i.test(body))throw new Error('检测到受保护媒体，不支持录制');
 if(body.includes('#EXT-X-MOUFLON'))throw new Error('直播使用自定义分片地址，当前 HTTP 适配器尚未支持，未启动录制');
 return {body,url:response.url||url};
}

// Inspect the media playlist too: a valid master can point to a fixed fallback clip.
export async function resolveLivePlaylist(url,headers,options={}){
 for(let depth=0;depth<4;depth++){
  const result=await readManifest(url,headers,options);const body=result.body;url=result.url;
  if(body.includes('#EXT-X-STREAM-INF:')){
   const lines=body.split(/\r?\n/).map(l=>l.trim());const variants=[];
   for(let i=0;i<lines.length;i++)if(lines[i].startsWith('#EXT-X-STREAM-INF:')){
    const uri=lines[i+1];if(uri&&!uri.startsWith('#'))variants.push({uri,bandwidth:Number(lines[i].match(/(?:^|[:,])BANDWIDTH=(\d+)/)?.[1]||0)});
   }
   for(const variant of variants){const index=lines.findIndex((line,i)=>line.startsWith('#EXT-X-STREAM-INF:')&&lines[i+1]===variant.uri);Object.assign(variant,rankVariant(lines[index]));}
   variants.sort(highestQuality);
   if(!variants.length)throw new Error('主清单没有可用的视频流');
   url=sourceUrl(new URL(variants[0].uri,url).href);continue;
  }
  if(body.includes('#EXT-X-ENDLIST')||/\/cpa\/|(?:^|\/)media\.mp4(?:[?\r\n]|$)/m.test(body))throw new Error('返回的是已结束的短片或占位媒体，未识别到真实直播');
  if(!/#EXTINF:/.test(body)||!/#EXT-X-MEDIA-SEQUENCE:\d+/.test(body))throw new Error('清单尚无可录制的直播分片');
  return sourceUrl(url);
 }
 throw new Error('直播清单嵌套过深');
}
