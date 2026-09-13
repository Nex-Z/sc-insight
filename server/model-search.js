import {classifyRoom} from '../src/room-state.js';
import {rememberSnapshot} from './snapshot-hints.js';
export function publicImageUrl(value){
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
export async function searchOfficialModels(query,{fetcher=fetch}={}){
 if(typeof query!=='string'||!query.trim()||query.trim().length>80)throw new Error('请输入 1–80 个字符的搜索词');
 const url=new URL('https://stripchat.com/api/front/v5/models/search/group/all');
 url.search=new URLSearchParams({query:query.trim(),limit:'100',primaryTag:'girls'});
 const response=await fetcher(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(`官网搜索失败（HTTP ${response.status}）`);
 const reader=response.body.getReader();let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4*1024*1024)throw new Error('官网搜索响应过大');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const group=JSON.parse(Buffer.concat(chunks).toString('utf8')).groups?.username;
 if(!Array.isArray(group?.models)||!Number.isInteger(group.totalCount)||group.totalCount<0)throw new Error('官网搜索响应结构变化');
 const unique=new Map();let skipped=0;
 for(const m of group.models){
  if(!m||! /^[1-9]\d*$/.test(String(m.id))||(typeof m.id==='number'&&!Number.isSafeInteger(m.id))||typeof m.username!=='string'||!/^[-\w]{1,80}$/.test(m.username)){skipped++;continue;}
  unique.set(String(m.id),{source_id:String(m.id),snapshot_url:rememberSnapshot(m),name:m.username,country:m.country||'未知',viewers:Number.isInteger(m.viewersCount)&&m.viewersCount>=0?m.viewersCount:0,room_status:classifyRoom(m).status,online:classifyRoom(m).online,fresh:Boolean(m.status),cover_url:publicImageUrl(m.previewUrlThumbBig)||publicImageUrl(m.previewUrl),avatar_url:publicImageUrl(m.avatarUrl)});
 }
 return {models:[...unique.values()],total:group.totalCount,skipped,scope:'官网用户名搜索 · 女主播分类'};
}
