import WebSocket from 'ws';
import {HttpsProxyAgent} from 'https-proxy-agent';

export function chatMessage(m){
 if(!m||m.isDeleted||!m.id)return null;
 const d=m.details||{},u=m.userData||{},extra=m.additionalData||{},anonymous=d.isAnonymous===true;
 const amount=['tip','privateTip'].includes(m.type)&&Number.isSafeInteger(d.amount)&&d.amount>=0?d.amount:null;
 let text=typeof d.body==='string'?d.body.trim():'';
 if(['tip','privateTip'].includes(m.type))text=(d.source==='tipMenu'?'小费菜单 · ':'')+(amount==null?'打赏（金额未知）':`打赏 ${amount} TK`)+(text?' · '+text:'');
 else if(m.type==='lovense')text=typeof d.lovenseDetails?.text==='string'&&d.lovenseDetails.text.trim()?d.lovenseDetails.text.trim():'设备互动';
 else if(m.type==='thresholdGoal')text='直播目标'+(text?'：'+text:'已更新');
 if(!text){if(m.type==='text'||typeof m.type!=='string')return null;text='互动事件（内容暂不支持）';}
 const ranking=!anonymous&&u.userRanking;
 const badges=anonymous?[]:[extra.isKnight?'房管':null,extra.isStudioModerator?'工作室房管':null,u.isAdmin||u.isSupport?'平台人员':null,u.isUltimate?'会员':null,d.fanClubTier?'粉丝团':null].filter(Boolean);
 return {id:String(m.id),username:anonymous?'匿名':String(u.username||'访客').slice(0,80),userId:anonymous?null:u.id?String(u.id):null,text:text.slice(0,2000),type:m.type,tipMenu:d.source==='tipMenu'&&['tip','privateTip'].includes(m.type),time:m.createdAt,amount,anonymous,
 role:anonymous?'anonymous':u.isModel?(String(u.id)===String(m.modelId)?'host':'model'):'user',level:ranking&&Number.isInteger(ranking.level)&&ranking.level>=0?ranking.level:null,league:ranking&&typeof ranking.league==='string'?ranking.league:null,badges};
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
   if(data.error){emit('status',{text:'聊天连接被官网拒绝，请重试或前往官网'});emit('connection',{state:'error'});continue;}
   if(data.id===1&&data.connect)socket.send(JSON.stringify({id:2,subscribe:{channel:'newChatMessage@'+model.source_id}}));
   if(data.id===2&&data.subscribe){emit('status',{text:'实时聊天已连接'});emit('connection',{state:'connected'});}
   if(data.push?.channel==='newChatMessage@'+model.source_id){const raw=data.push.pub?.data;const message=chatMessage(raw?.message||raw);if(message)emit('message',{...message,source:'live'});}
  }}catch{emit('status',{text:'部分聊天消息格式暂不支持'});}
 });
 socket.on('error',()=>{emit('status',{text:'聊天连接失败，可点击重试'});emit('connection',{state:'error'});});
 socket.on('close',()=>{if(!closed){emit('status',{text:'聊天连接已断开，可点击重试'});emit('connection',{state:'disconnected'});}});
 // History and live messages are deduplicated by their platform message IDs in the UI.
 void fetcher(`https://stripchat.com/api/front/v2/models/${model.source_id}/chat?source=regular`,{signal:AbortSignal.timeout(15000)}).then(async r=>{if(!r.ok)throw new Error();const j=await r.json();if(!closed)for(const m of (j.messages||[]).slice(-100)){const message=chatMessage(m);if(message)emit('message',{...message,source:'history'});}}).catch(()=>{if(!closed)emit('status',{text:'历史聊天暂不可用，等待实时消息'});});
 return ()=>{closed=true;socket.terminate();};
}
