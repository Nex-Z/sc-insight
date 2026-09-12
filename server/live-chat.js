import WebSocket from 'ws';
import {HttpsProxyAgent} from 'https-proxy-agent';

export function chatMessage(m){
 if(!m||m.isDeleted||!m.id||typeof m.details?.body!=='string')return null;
 return {id:String(m.id),username:String(m.userData?.username||'访客').slice(0,80),text:m.details.body.slice(0,2000),type:m.type,time:m.createdAt};
}
export async function connectLiveChat(model,emit,{fetcher=fetch}={}){
 const config=await fetcher('https://zh.stripchat.com/api/front/v3/config/initial-dynamic?'+new URLSearchParams({requestPath:'/'+model.name}),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
 if(!config.ok)throw new Error('公开聊天配置暂不可用');
 const {websocket}= (await config.json()).initialDynamic||{};
 const url=new URL(websocket?.url);
 if(url.protocol!=='wss:'||!url.hostname.endsWith('.stripchat.com')||typeof websocket.token!=='string'||!websocket.token)throw new Error('公开聊天连接配置无效');
 const proxy=process.env.HTTPS_PROXY||process.env.HTTP_PROXY;
 const socket=new WebSocket(url,{agent:proxy?new HttpsProxyAgent(proxy):undefined,headers:{Origin:'https://zh.stripchat.com','User-Agent':'Mozilla/5.0'},handshakeTimeout:15000,maxPayload:1024*1024});
 let closed=false;
 socket.on('open',()=>socket.send(JSON.stringify({id:1,connect:{token:websocket.token,name:'js'}})));
 socket.on('message',bytes=>{
  try{for(const line of bytes.toString().split('\n').filter(Boolean)){
   const data=JSON.parse(line);
   if(!Object.keys(data).length){socket.send('{}');continue;}
   if(data.error){emit('status',{text:'聊天连接被官网拒绝，请重试或前往官网'});continue;}
   if(data.id===1&&data.connect)socket.send(JSON.stringify({id:2,subscribe:{channel:'newChatMessage@'+model.source_id}}));
   if(data.id===2&&data.subscribe)emit('status',{text:'实时聊天已连接'});
   if(data.push?.channel==='newChatMessage@'+model.source_id){const raw=data.push.pub?.data;const message=chatMessage(raw?.message||raw);if(message)emit('message',message);}
  }}catch{emit('status',{text:'部分聊天消息格式暂不支持'});}
 });
 socket.on('error',()=>emit('status',{text:'聊天连接失败，可点击重试'}));
 socket.on('close',()=>{if(!closed)emit('status',{text:'聊天连接已断开，可点击重试'});});
 // History and live messages are deduplicated by their platform message IDs in the UI.
 void fetcher(`https://stripchat.com/api/front/v2/models/${model.source_id}/chat?source=regular`,{signal:AbortSignal.timeout(15000)}).then(async r=>{if(!r.ok)throw new Error();const j=await r.json();if(!closed)for(const m of (j.messages||[]).slice(-100)){const message=chatMessage(m);if(message)emit('message',message);}}).catch(()=>{if(!closed)emit('status',{text:'历史聊天暂不可用，等待实时消息'});});
 return ()=>{closed=true;socket.terminate();};
}
