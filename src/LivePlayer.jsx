import {manageLivePlayback} from './live-playback.js';
import React,{useEffect,useRef,useState} from 'react';
import Hls from 'hls.js';
import WatchLiveLink from './WatchLiveLink.jsx';
import {ArrowLeft,Heart,Video,RefreshCw,ExternalLink} from 'lucide-react';
export default function LivePlayer({model,onBack,onDetails,onFollow,onRecord}){
 const video=useRef(null),bottom=useRef(null);const [attempt,setAttempt]=useState(0),[status,setStatus]=useState('正在解析直播…'),[chatStatus,setChatStatus]=useState('等待直播连接'),[messages,setMessages]=useState([]);
 useEffect(()=>{
  let disposed=false,id,hls,events,playback;setMessages([]);setStatus('正在解析直播…');setChatStatus('等待直播连接');
  const release=()=>{if(id)fetch('/api/live/'+id,{method:'DELETE',keepalive:true}).catch(()=>{});};
  (async()=>{try{
   const response=await fetch('/api/live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model_id:model.id})});const session=await response.json();if(!response.ok)throw new Error(session.error);id=session.id;if(disposed){release();return;}
   const element=video.current;
   playback=manageLivePlayback(element,{getHls:()=>hls,onReconnect:()=>{if(!disposed)setAttempt(n=>n+1);},onStatus:text=>{if(!disposed)setStatus(text);}});
   if(Hls.isSupported()){hls=new Hls({lowLatencyMode:false,maxBufferLength:30,backBufferLength:15,liveSyncDurationCount:4,liveMaxLatencyDurationCount:10});hls.loadSource(session.url);hls.attachMedia(element);hls.on(Hls.Events.MANIFEST_PARSED,()=>{if(!disposed)void playback.start();});hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal&&!disposed){if(data.type===Hls.ErrorTypes.NETWORK_ERROR)playback.recover();else if(data.type===Hls.ErrorTypes.MEDIA_ERROR)playback.recover(true);else setStatus('直播格式不受支持，请前往官网');}});}
   else if(element.canPlayType('application/vnd.apple.mpegurl')){element.src=session.url;void playback.start();}else throw new Error('当前浏览器不支持 HLS 播放');
   events=new EventSource(session.chat);events.addEventListener('status',e=>setChatStatus(JSON.parse(e.data).text));events.addEventListener('message',e=>{const m=JSON.parse(e.data);setMessages(rows=>rows.some(r=>r.id===m.id)?rows:[...rows,m].sort((a,b)=>(Date.parse(a.time)||0)-(Date.parse(b.time)||0)).slice(-150));});events.onerror=()=>setChatStatus('聊天连接中断，正在重新连接…');
  }catch(e){if(!disposed)setStatus(e.message);}})();
  window.addEventListener('pagehide',release);
  return()=>{disposed=true;window.removeEventListener('pagehide',release);events?.close();playback?.close();hls?.destroy();const element=video.current;if(element){element.pause();element.removeAttribute('src');element.load();}release();};
 },[model.id,attempt]);
 useEffect(()=>{const log=bottom.current?.parentElement;if(log&&log.scrollHeight-log.scrollTop-log.clientHeight<180)log.scrollTop=log.scrollHeight;},[messages]);
 return <section className="live-room" aria-label={`${model.name} 的直播间`}>
  <header className="live-room-nav"><button onClick={onBack}><ArrowLeft size={17}/>发现主播</button><span>直播间 / <strong>{model.name}</strong></span><WatchLiveLink model={model}/></header>
  <div className="live-room-stage">
   <div className="live-room-screen"><video ref={video} controls playsInline poster={model.cover_url||model.avatar_url||undefined}/><div className="live-room-player-status"><span role="status">{status}</span><button onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={14}/>重新连接</button></div></div>
   <aside className="live-chat"><header><h2>聊天室</h2><span>只读</span></header><p className="live-chat-status" role="status">{chatStatus}</p><div className="live-chat-messages" role="log" aria-label="直播聊天">{messages.map(m=><p key={m.id}><strong>{m.username}：</strong>{m.text}</p>)}{!messages.length&&<p className="muted">等待聊天消息…</p>}<div ref={bottom}/></div><footer>公开聊天 · 发言请前往官网</footer></aside>
  </div>
  <section className="live-room-info"><div><span className="live-room-eyebrow">主播</span><h1>{model.name}</h1><p>平台 ID {model.source_id} <span>·</span> 默认最高可用画质</p></div><div className="live-room-actions"><button onClick={onFollow} className={model.favorite?'active':''}><Heart size={17}/>{model.favorite?'已关注':'关注主播'}</button><button onClick={onDetails}><ExternalLink size={17}/>主播详情</button><button className="primary" onClick={onRecord}><Video size={17}/>录制直播</button></div></section>
 </section>;
}
