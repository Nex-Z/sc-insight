import {createHash} from 'node:crypto';
import keys from './public-format-keys.json' with {type:'json'};
import {sourceUrl} from './media.js';
import {rankVariant,highestQuality} from './quality.js';

// Interoperability for public playlist URL obfuscation. Media bytes are untouched.
// IDs must be advertised by this response; never invent or substitute an ID.
export function advertisedFormat(body){
 const advertised=[...body.matchAll(/^#EXT-X-MOUFLON:PSCH:([^:\r\n]+):([^\r\n]+)$/gm)];
 return keys.formats.find(f=>advertised.some(m=>m[1]===f.scheme&&m[2].trim()===f.id));
}
export function formatById(id){return keys.formats.find(f=>f.id===id);}
export function decodeMediaUri(uri,key){
 const match=uri.match(/_([^_]+)_(\d+(?:_part\d+)?)\.mp4(?:[?#].*)?$/);
 if(!match)return sourceUrl(uri);
 const encoded=[...match[1]].reverse().join('');
 if(!/^[a-zA-Z0-9+/]+={0,2}$/.test(encoded))throw new Error('分片地址编码已变化');
 const bytes=Buffer.from(encoded,'base64'),mask=createHash('sha256').update(key).digest();
 for(let i=0;i<bytes.length;i++)bytes[i]^=mask[i%mask.length];
 const name=bytes.toString('utf8');
 if(!/^[a-zA-Z0-9-]{1,128}$/.test(name))throw new Error('分片地址格式无法还原');
 return sourceUrl(uri.slice(0,match.index)+'_'+name+'_'+match[2]+'.mp4');
}
export function rewriteMouflon(body,format,base){
 if(!format||!advertisedFormat(body)||!body.includes(`#EXT-X-MOUFLON:PSCH:${format.scheme}:${format.id}`))throw new Error('直播清单使用了未知地址格式');
 if(/#EXT-X-ENDLIST|\/cpa\/|#EXT-X-MOUFLON-ADVERT/.test(body))throw new Error('上游返回占位短片，未识别到真实直播');
 if(/#EXT-X-KEY:(?!METHOD=NONE)/.test(body))throw new Error('不支持受保护的直播媒体');
 let pending=null,media=false;const output=[];
 for(const line of body.split(/\r?\n/)){
  const value=line.trim();
  if(value.startsWith('#EXT-X-MOUFLON:URI:')){pending=decodeMediaUri(new URL(value.slice(19).trim(),base).href,format.key);continue;}
  if(value.startsWith('#EXT-X-MOUFLON:'))continue;
  if(value.startsWith('#EXTINF:'))media=true;
  if(value.startsWith('#EXT-X-PART:')){pending=null;continue;}
  if(/^#EXT-X-(PRELOAD-HINT|RENDITION-REPORT|PART-INF|SERVER-CONTROL):/.test(value))continue;
  if(value&&!value.startsWith('#')&&media){if(!pending)throw new Error('直播分片缺少真实地址');output.push(pending);pending=null;media=false;continue;}
  output.push(line);
 }
 const result=output.join('\n');
 if(!/#EXTINF:/.test(result))throw new Error('直播尚无完整分片');
 return result;
}
export function bestVariant(body,base){
 const lines=body.split(/\r?\n/).map(l=>l.trim()),variants=[];
 for(let i=0;i<lines.length-1;i++)if(lines[i].startsWith('#EXT-X-STREAM-INF:')&&lines[i+1]&&!lines[i+1].startsWith('#'))variants.push({url:sourceUrl(new URL(lines[i+1],base).href),bandwidth:Number(lines[i].match(/(?:[:,])BANDWIDTH=(\d+)/)?.[1]||0)});
 for(const variant of variants){const index=lines.findIndex((line,i)=>line.startsWith('#EXT-X-STREAM-INF:')&&new URL(lines[i+1],base).href===variant.url);Object.assign(variant,rankVariant(lines[index]));}
 variants.sort(highestQuality);
 if(!variants.length)throw new Error('主清单缺少视频流');
 return variants[0].url;
}
