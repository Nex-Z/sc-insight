import {useLivePoster} from './use-live-poster.js';
import {LiveRoomInfo} from './PublicModelInfo.jsx';
import LiveRecentStats from './LiveRecentStats.jsx';
import LiveSessionStats from './LiveSessionStats.jsx';
import {manageLivePlayback} from './live-playback.js';
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import Hls from 'hls.js';
import WatchLiveLink from './WatchLiveLink.jsx';
import {ArrowLeft,Heart,Video,RefreshCw,ExternalLink,Maximize,Minimize,Pin} from 'lucide-react';
export default function LivePlayer({model,onBack,onFollow,onRecord,refreshSeconds=5}){
 const poster=useLivePoster(model);
 const stage=useRef(null),screen=useRef(null),chatLog=useRef(null),followChat=useRef(true),hideTimer=useRef(null);
 const [fullscreen,setFullscreen]=useState(false),[pinned,setPinned]=useState(false),[chatVisible,setChatVisible]=useState(true),[playerHeight,setPlayerHeight]=useState(400);
 const video=useRef(null);const [attempt,setAttempt]=useState(0),[status,setStatus]=useState('正在解析直播…'),[chatStatus,setChatStatus]=useState('等待直播连接'),[messages,setMessages]=useState([]);
 useEffect(()=>{
  let disposed=false,id,hls,events,playback;followChat.current=true;setMessages([]);setStatus('正在解析直播…');setChatStatus('等待直播连接');
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
 useLayoutEffect(()=>{const log=chatLog.current;if(log&&followChat.current)log.scrollTop=log.scrollHeight;},[messages,fullscreen,playerHeight]);
 useEffect(()=>{const resize=new ResizeObserver(()=>{if(!document.fullscreenElement)setPlayerHeight(screen.current.getBoundingClientRect().height);});resize.observe(screen.current);const changed=()=>{setFullscreen(document.fullscreenElement===stage.current);setChatVisible(true);};document.addEventListener('fullscreenchange',changed);return()=>{resize.disconnect();clearTimeout(hideTimer.current);document.removeEventListener('fullscreenchange',changed);};},[]);
 async function toggleFullscreen(){try{if(document.fullscreenElement===stage.current)await document.exitFullscreen();else await stage.current.requestFullscreen();}catch{setStatus('当前浏览器无法进入全屏');}}
 function revealChat(event){if(!fullscreen)return;clearTimeout(hideTimer.current);setChatVisible(true);if(!event.target.closest('.live-chat'))hideTimer.current=setTimeout(()=>setChatVisible(false),2500);}
 return <section className="live-room" aria-label={`${model.name} 的直播间`}>
  <header className="live-room-nav"><button onClick={onBack}><ArrowLeft size={17}/>返回</button><span>直播间 / <strong>{model.name}</strong></span><WatchLiveLink model={model}/></header>
  <section className="live-room-info"><div><span className="live-room-eyebrow">主播</span><h1>{model.name}</h1><p>平台 ID {model.source_id} <span>·</span> 默认最高可用画质</p></div><div className="live-room-actions"><button onClick={onFollow} className={model.favorite?'active':''}><Heart size={17}/>{model.favorite?'已关注':'关注主播'}</button><a className="live-detail-link" href={`#detail/${model.id}`} target="_blank" rel="noopener noreferrer" title="在新标签页查看主播详情"><ExternalLink size={17}/>主播详情</a><button className="primary" onClick={onRecord}><Video size={17}/>录制直播</button></div></section>
  <div ref={stage} className={`live-room-stage ${fullscreen?'is-fullscreen':''} ${pinned||chatVisible?'chat-visible':''}`} style={{'--player-height':`${playerHeight}px`}} onPointerMove={revealChat} onPointerLeave={()=>{clearTimeout(hideTimer.current);setChatVisible(false);}}>
   <div ref={screen} className="live-room-screen"><div className="live-video-wrap"><video ref={video} controls controlsList="nofullscreen" onDoubleClick={toggleFullscreen} playsInline poster={poster}/><button className="live-fullscreen-button" aria-label={fullscreen?'退出全屏':'全屏观看'} onClick={toggleFullscreen}>{fullscreen?<Minimize size={16}/>:<Maximize size={16}/>}</button></div><div className="live-room-player-status"><span role="status">{status}</span><button onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={14}/>重新连接</button></div></div>
   <aside className="live-chat" onPointerLeave={()=>{if(fullscreen)setChatVisible(false);}}><header><h2>聊天室</h2>{fullscreen?<button aria-label="固定全屏弹幕" aria-pressed={pinned} onClick={()=>setPinned(v=>!v)}><Pin size={14}/>{pinned?'已固定':'移出隐藏'}</button>:<span>只读</span>}</header><p className="live-chat-status" role="status">{chatStatus}</p><div ref={chatLog} onScroll={e=>{const el=e.currentTarget;followChat.current=el.scrollHeight-el.scrollTop-el.clientHeight<48;}} className="live-chat-messages" role="log" aria-label="直播聊天">{messages.map(m=><p key={m.id}><span className={'chat-author chat-role-'+(m.role||'user')}>{m.role==='host'&&<b className="chat-badge">主播</b>}{m.role==='model'&&<b className="chat-badge">主播访客</b>}{m.level!=null&&<b className="chat-level" title={m.league||undefined}>Lv.{m.level}</b>}{m.badges?.map(b=><b key={b} className="chat-badge">{b}</b>)}<strong>{m.username}：</strong></span>{m.text||'互动消息'}</p>)}{!messages.length&&<p className="muted">等待聊天消息…</p>}</div><footer>公开聊天 · 发言请前往官网</footer></aside>
  </div>

 <LiveRoomInfo key={model.id} model={model}/>
 <LiveSessionStats key={model.id} model={model} refreshSeconds={refreshSeconds}/>
 <LiveRecentStats key={model.id} model={model}/>
 </section>;
}
