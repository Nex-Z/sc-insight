import React,{useState} from 'react';
import {insightApi,useInsight,when} from './insight-api.js';
const kinds=[['','全部事件'],['online','上线'],['offline','下线'],['highlight','高光'],['goalComplete','目标完成'],['goalNear','目标接近完成'],['profile','资料变化'],['rule','监控规则']];
export default function NotificationCenter({onChange}){
 const [kind,setKind]=useState(''),[unread,setUnread]=useState(false),[before,setBefore]=useState(''),[error,setError]=useState('');
 const feed=useInsight(`/notifications?kind=${kind}&unread=${unread}&before=${before||'9223372036854775807'}`,5000);
 async function mark(body){try{await insightApi('/notifications/read',body);feed.reload();onChange?.();}catch(e){setError(e.message);}}
 const link=e=>e.kind==='highlight'?`#detail/${e.model_id}/content/highlight/${e.payload.highlightId}`:e.kind==='profile'?`#detail/${e.model_id}/changes`:e.payload.sessionId||e.linked_session?`#detail/${e.model_id}/session/${e.payload.sessionId||e.linked_session}`:`#detail/${e.model_id}`;
 return <section className="md-section insight-notifications"><div className="md-section-title"><h2>站内通知 <small>{feed.data?.unread??'—'} 条未读</small></h2><button disabled={!feed.data?.latest} onClick={()=>mark({through:feed.data.latest})}>全部标为已读</button></div>
 <p className="muted">关注或监控后自动记录上下线、目标完成和高光；点击通知可快速查看数据。已读状态在本站共享保存。</p>
 <div className="insight-filters"><select aria-label="通知类型" value={kind} onChange={e=>{setKind(e.target.value);setBefore('');}}>{kinds.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select><label><input type="checkbox" checked={unread} onChange={e=>{setUnread(e.target.checked);setBefore('');}}/>只看未读</label></div>
 {(error||feed.error)&&<p role="alert">{error||feed.error}</p>}
 <div className="insight-feed">{feed.data?.items.map(e=><article key={e.id} className={e.read_at?'':'is-unread'}><div><time>{when(e.created_at)}</time><h3>{e.title}</h3><p>{e.detail}</p></div><div className="insight-actions">{e.model_id&&<a href={link(e)} onClick={()=>void mark({id:e.id})}>{e.kind==='highlight'?'查看高光':e.kind==='profile'?'查看变化':'查看直播数据'}</a>}{!e.read_at&&<button onClick={()=>mark({id:e.id})}>标为已读</button>}</div></article>)}</div>
 {feed.data&&!feed.data.items.length&&<p className="empty">暂无{unread?'未读':''}通知</p>}<div className="insight-actions">{before&&<button onClick={()=>setBefore('')}>返回最新</button>}{feed.data?.nextBefore&&<button onClick={()=>setBefore(feed.data.nextBefore)}>更早通知</button>}</div></section>;
}
