import React,{useEffect,useState,useRef} from 'react';
const prefix='sc-notifications:';
const read=(key,fallback='0')=>{try{return localStorage.getItem(prefix+key)||fallback;}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(prefix+key,String(value));}catch{}};
const id=value=>/^\d+$/.test(String(value))?BigInt(value):0n;
export const newest=events=>events.reduce((n,e)=>id(e.id)>id(n)?String(e.id):n,'0');
export const unreadEvents=(events,seen)=>events.filter(e=>id(e.id)>id(seen));
export function useNotifications(events,loaded,page){
 const [seen,setSeen]=useState(()=>read('read')),[enabled,setEnabled]=useState(()=>read('enabled')==='1'),[permission,setPermission]=useState(()=>globalThis.Notification?.permission||'unsupported'),[error,setError]=useState('');
 const [requesting,setRequesting]=useState(false),[feedback,setFeedback]=useState('');const permissionTimer=useRef();
 useEffect(()=>()=>clearTimeout(permissionTimer.current),[]);
 const supported=!!globalThis.Notification&&globalThis.isSecureContext;
 function markRead(){const value=newest(events);const next=id(value)>id(read('read'))?value:read('read');write('read',next);setSeen(next);}
 useEffect(()=>{const sync=()=>{setSeen(read('read'));setEnabled(read('enabled')==='1');setPermission(globalThis.Notification?.permission||'unsupported');};window.addEventListener('storage',sync);window.addEventListener('focus',sync);return()=>{window.removeEventListener('storage',sync);window.removeEventListener('focus',sync);};},[]);
 useEffect(()=>{if(!loaded)return;const mark=()=>{if(page==='alerts'&&document.visibilityState==='visible')markRead();};mark();document.addEventListener('visibilitychange',mark);return()=>document.removeEventListener('visibilitychange',mark);},[events,loaded,page]);
 useEffect(()=>{if(!loaded)return;let cancelled=false;
 const deliver=()=>{if(cancelled)return;const latest=newest(events),previous=read('delivered','');
 // Establish a baseline: enabling or reopening never floods the desktop with history.
 if(!previous||!enabled||permission!=='granted'){write('delivered',latest);return;}
 const fresh=unreadEvents(events,previous).filter(e=>id(e.id)>id(read('read')));
 if(id(latest)>id(previous))write('delivered',latest);
 if(!fresh.length||page==='alerts'&&document.visibilityState==='visible')return;
 try{const event=fresh[0];const notification=new Notification(fresh.length>1?`SC Insight · ${fresh.length} 条新提醒`:event.title,{body:fresh.length>1?fresh.slice(0,3).map(e=>`${e.name||''} ${e.title}`).join('\n'):`${event.name||''} ${event.detail||''}`,tag:'sc-events-'+latest});notification.onclick=()=>{window.focus();location.hash='alerts';notification.close();};}catch(e){setError('浏览器未能显示通知：'+e.message);}
 };
 if(navigator.locks)navigator.locks.request('sc-browser-notifications',deliver).catch(()=>{});else deliver();return()=>{cancelled=true;};
 },[events,loaded,enabled,permission,page]);
 function testNotification(){setError('');setFeedback('');try{const notification=new Notification('SC Insight · 测试通知',{body:'浏览器通知已连接。后续新事件将在这里提醒。',tag:'sc-notification-test'});notification.onerror=()=>{setFeedback('');setError('系统未能显示通知，请检查浏览器和系统通知设置');};notification.onclick=()=>{window.focus();notification.close();};setFeedback('已请求发送测试通知；若未看到弹窗，请检查系统通知中心、勿扰模式及浏览器通知设置。');}catch(e){setError('测试通知发送失败：'+e.message);}}
 async function toggle(){if(requesting)return;setError('');setFeedback('');if(enabled&&permission==='granted'){write('enabled','0');setEnabled(false);return;}if(!supported){setError('当前环境不支持系统通知，请使用 Chrome / Edge 打开此地址');return;}
 if(Notification.permission==='denied'){setPermission('denied');setError('浏览器已阻止通知，不会再次弹出授权框。请在地址栏的网站权限中允许通知，再重试。');return;}
 setRequesting(true);setFeedback('等待浏览器授权，请查看地址栏附近的权限提示。');permissionTimer.current=setTimeout(()=>setFeedback('浏览器尚未返回授权结果。内置浏览器可能不提供权限弹窗，请复制当前地址到 Chrome / Edge 后开启通知。'),8000);
 try{const p=await Notification.requestPermission();setPermission(p);if(p==='granted'){write('delivered',newest(events));write('enabled','1');setEnabled(true);setFeedback('通知已开启。点击“发送测试通知”验证系统弹窗。');}else{setFeedback('');setError(p==='denied'?'通知权限被拒绝，请在浏览器网站设置中允许通知':'未获得通知权限。若没有看到授权框，请在 Chrome / Edge 中打开此地址后重试。');}}catch(e){setFeedback('');setError(e.message);}finally{clearTimeout(permissionTimer.current);setRequesting(false);}}

 return {unread:unreadEvents(events,seen).length,enabled,permission,supported,error,requesting,feedback,testNotification,toggle,markRead};
}
export function BrowserNotificationSetting({notifications:n}){const active=n.enabled&&n.permission==='granted';return <div className="browser-notification-setting"><div className="notification-row"><div><strong>浏览器通知</strong><small>{active?'已启用 · 页面保持打开时接收新事件':n.permission==='denied'?'浏览器已阻止通知':n.supported?'尚未开启':'当前浏览器不支持'}</small></div><button onClick={n.toggle} disabled={n.requesting||!n.supported}>{n.requesting?'等待授权…':active?'关闭通知':'开启通知'}</button>{active&&<button onClick={n.testNotification}>发送测试通知</button>}</div>{n.feedback&&<p role="status" className="notification-feedback">{n.feedback}</p>}{n.error&&<p role="alert">{n.error}</p>}{!n.supported&&<p>请在 Chrome / Edge 中打开此页面，使用 HTTPS 或 localhost。</p>}<small>已读状态保存在当前浏览器；关闭所有页面后不接收系统通知。</small></div>;}
