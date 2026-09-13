import {classifyRoom} from '../src/room-state.js';
import {publicIdentity} from './public-info.js';
export async function inspectRoomState(model,{fetcher=fetch}={}){
 if(!/^\d+$/.test(String(model.source_id)))throw new Error('主播平台 ID 无效');
 const r=await fetcher(`https://stripchat.com/api/front/v2/models/${model.source_id}/cam`,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error(`房间状态查询失败（HTTP ${r.status}），不视为离线`);
 const reader=r.body.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4*1024*1024)throw new Error('房间响应过大');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const data=JSON.parse(Buffer.concat(chunks).toString('utf8')),user=publicIdentity(data,model);
 return {...classifyRoom(user,data.cam),modelId:String(user.id),name:user.username};
}
