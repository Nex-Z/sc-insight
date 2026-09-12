import React,{useEffect,useState} from 'react';
import {captureView} from './capture-groups.js';

async function api(path='',body){const response=await fetch('/api/browser-capture'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw new Error(data.error||'浏览器操作失败');return data;}
export default function BrowserCapture({recordings=[],onChange=()=>{}}){
 const [state,setState]=useState({pages:[]}),[pageId,setPageId]=useState(''),[candidateId,setCandidateId]=useState(''),[browser,setBrowser]=useState('msedge'),[endpoint,setEndpoint]=useState('http://127.0.0.1:9222'),[seconds,setSeconds]=useState(60),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[showAll,setShowAll]=useState(false);
 const page=state.pages.find(p=>p.id===pageId)||state.pages[0];
 const {visible,recommended,groupCount}=captureView(page?.candidates||[],{showAll,recommendedId:page?.recommendedId});
 const candidate=visible.find(c=>c.groupKey===candidateId);
 useEffect(()=>{let alive=true;const poll=()=>api().then(s=>{if(alive)setState(s);}).catch(e=>{if(alive)setMessage(e.message);});poll();const timer=setInterval(poll,2000);return()=>{alive=false;clearInterval(timer);};},[]);
 async function action(fn){setBusy(true);setMessage('');try{await fn();setState(await api());}catch(e){setMessage(e.message);}finally{setBusy(false);}}
 async function recordingAction(id,operation){await action(async()=>{const r=await fetch(`/api/recordings/${id}/${operation}`,{method:'POST'});const data=await r.json();if(!r.ok)throw new Error(data.error);await onChange();});}
 return <section className="panel browser-capture">
  <div className="panel-head"><h3>Browser Media Capture</h3><span>{state.connected?'正在监听':'未连接'}</span></div>
  <p>连接当前浏览器后，在页面中正常播放媒体。未启用 CDP 时会打开独立浏览器，请在该窗口访问网站。</p>
  <div className="capture-controls">
   <label>浏览器<select aria-label="捕获浏览器" value={browser} disabled={state.connected} onChange={e=>setBrowser(e.target.value)}><option value="msedge">Microsoft Edge</option><option value="chrome">Google Chrome</option><option value="chromium">Chromium</option></select></label>
   <label>本机 CDP 地址<input aria-label="本机 CDP 地址" value={endpoint} disabled={state.connected} onChange={e=>setEndpoint(e.target.value)}/></label>
   <button className="primary" disabled={busy||state.connected} onClick={()=>action(()=>api('/connect',{browser,endpoint}))}>连接 / 打开浏览器</button>
   <button disabled={busy||!state.connected} onClick={()=>action(()=>api('/disconnect',{}))}>断开监听</button>
  </div>
  {state.connected&&<>
   <div className="capture-controls"><label>监听页面<select aria-label="监听页面" value={page?.id||''} onChange={e=>{setPageId(e.target.value);setCandidateId('');}}>{state.pages.map(p=><option key={p.id} value={p.id}>{p.title||p.url}</option>)}</select></label><button disabled={busy||!page} onClick={()=>action(()=>api(`/pages/${page.id}/refresh`,{reload:true}))}>刷新页面并重新检测</button><button disabled={busy||!page} onClick={()=>action(()=>api(`/pages/${page.id}/refresh`,{}))}>清空候选</button></div>
   <p className="capture-url">{page?.url}</p>
   {!!page?.candidates.length&&<div className="capture-controls"><span>发现 {groupCount} 组播放清单 · {page.candidates.length} 条请求</span><label><input type="checkbox" checked={showAll} onChange={e=>{setShowAll(e.target.checked);setCandidateId('');}}/>显示全部原始请求</label><span>同一低延迟 HLS 的更新请求已合并；录制采用最新实际地址。</span></div>}
   {!page?.candidates.length?<p role="status">尚未发现媒体。请在浏览器中播放视频，或刷新已打开的页面。</p>:<div className="capture-table"><table><thead><tr><th>选择</th><th>类型 / 推荐</th><th>媒体 URL</th><th>请求</th><th>会话信息</th></tr></thead><tbody>{visible.map(c=><tr key={c.groupKey}><td><input type="radio" name="capture-stream" aria-label={`选择 ${c.kind} ${c.url}`} checked={candidateId===c.groupKey} disabled={!c.recordable} onChange={()=>setCandidateId(c.groupKey)}/></td><td>{c.master?'HLS 主清单（自动清晰度）':c.kind==='HLS'?'HLS 媒体清单':c.kind}{c.protectedMedia&&<small className="block">DRM / 受保护媒体，不支持录制</small>}{recommended?.id===c.id&&<small className="block">最可能的主流</small>}</td><td><details><summary className="capture-url">{new URL(c.url).host}{new URL(c.url).pathname}</summary><div className="capture-url">{c.url}</div></details><small>{c.contentType||'未知 MIME'}</small></td><td>{c.method} · {c.status}<small className="block">发现 {c.requestCount} 次{c.versions>1?` · 合并 ${c.versions} 个更新地址`:""}{!c.recordable?' · 仅供识别':''}</small></td><td><details><summary>{c.hasCookies?'含会话 Cookie':'无 Cookie'} · {c.headerNames.length} 个请求头</summary><p className="capture-url">Referer: {c.referer||'无'}<br/>User-Agent: {c.userAgent||'无'}<br/>{c.headerNames.join(', ')}</p></details></td></tr>)}</tbody></table></div>}
   <div className="capture-controls"><label>录制秒数<input aria-label="录制秒数" type="number" min="5" max="21600" value={seconds} onChange={e=>setSeconds(Number(e.target.value))}/></label><button disabled={!recommended} onClick={()=>setCandidateId(recommended.groupKey)}>选择推荐流</button><button className="primary" disabled={busy||!candidate?.recordable} onClick={()=>action(async()=>{const r=await api('/record',{pageId:page.id,candidateId:candidate.id,max_seconds:seconds});setMessage(`录制任务 #${r.id} 已加入队列`);await onChange();})}>录制所选媒体</button></div>
  </>}
  {message&&<p role="status">{message}</p>}
  {recordings.filter(r=>!r.model_id).map(r=><div className="capture-job" key={r.id}><span>{r.filename} · {r.status} · {r.duration} · {r.size}{r.error&&` · ${r.error}`}</span>{['排队中','连接中','录制中'].includes(r.status)?<button disabled={busy} onClick={()=>recordingAction(r.id,'stop')}>停止录制</button>:['已完成','已中断'].includes(r.status)?<a href={`/api/recordings/${r.id}/file`} target="_blank" rel="noreferrer">播放录像</a>:null}</div>)}
 </section>;
}
