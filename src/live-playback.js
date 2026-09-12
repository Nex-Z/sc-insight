// Keep explicit pauses intact while recovering stalls and recoverable HLS failures.
export function manageLivePlayback(video,{getHls,onStatus,now=()=>Date.now(),interval=setInterval,cancelInterval=clearInterval}){
 let closed=false,userPaused=false,blocked=false,playing=false,recovering=false,lastTime=video.currentTime,lastProgress=now(),lastRecovery=-Infinity,retries=0;
 const listeners=[];
 function listen(name,fn){video.addEventListener(name,fn);listeners.push([name,fn]);}
 async function play(){
  if(closed||userPaused||blocked)return;
  try{await video.play();}catch(e){
   if(closed||userPaused)return;
   if(e.name==='NotAllowedError'&&!video.muted){video.muted=true;try{await video.play();return;}catch{}}
   if(e.name==='NotAllowedError'){blocked=true;onStatus('浏览器阻止了自动播放，请点击播放');}
  }
 }
 function recover(mediaError=false){
  if(closed||userPaused||blocked||now()-lastRecovery<8000)return;
  if(retries>=3){onStatus('直播持续中断，请重新连接');return;}
  lastRecovery=now();retries++;recovering=true;onStatus('正在恢复直播…');
  const hls=getHls();
  if(hls){if(mediaError)hls.recoverMediaError();else hls.startLoad(-1);
   const position=hls.liveSyncPosition;if(Number.isFinite(position)&&position>video.currentTime+2)video.currentTime=position;
  }else if(video.seekable?.length)video.currentTime=Math.max(0,video.seekable.end(video.seekable.length-1)-2);
  lastTime=video.currentTime;
  void play();
 }
 listen('play',()=>{userPaused=false;blocked=false;lastProgress=now();});
 listen('playing',()=>{playing=true;recovering=false;onStatus(video.muted?'直播播放中 · 静音，可开启声音':'直播播放中');});
 listen('pause',()=>{if(!closed&&!recovering&&!video.ended&&!video.error){userPaused=true;onStatus('已暂停');}});
 listen('waiting',()=>{if(!userPaused)onStatus('正在缓冲…');});
 listen('ended',()=>recover());
 listen('canplay',()=>{if(!playing||recovering)void play();});
 const timer=interval(()=>{
  if(closed||userPaused||blocked)return;
  if(video.currentTime>lastTime+.1){lastTime=video.currentTime;lastProgress=now();retries=0;}
  else if(now()-lastProgress>10000)recover(Boolean(video.error));
 },2000);
 return {start:play,recover,close(){closed=true;cancelInterval(timer);for(const [name,fn]of listeners)video.removeEventListener(name,fn);}};
}
