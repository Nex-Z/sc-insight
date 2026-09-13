import React,{useState} from 'react';
import {useInsight,when,number} from './insight-api.js';
const show=(v,field)=>field==='menu'?`${v?.enabled?'已开启':'已关闭'}\n${v?.items?.map(m=>`${m.activity} · ${m.price} TK`).join('\n')||'暂无菜单项目'}`:field==='albums'?v.map(a=>`${a[1]} · ${a[2]??'未知'} 张`).join('\n')||'暂无公开相册':String(v||'（空）');
export default function ProfileHistory({model}){
 const [before,setBefore]=useState(''),feed=useInsight(`/models/${model.id}/profile-history?before=${before||'9223372036854775807'}`,60000);
 return <section className="md-section"><div className="md-section-title"><h2>资料与内容变化</h2><span>约每 30 分钟检查</span></div><p className="muted">首次读取建立基线；只记录公开可见资料。相册接口仅返回部分照片，未再出现不代表删除。</p>
 <p>最近成功：{when(feed.data?.status?.succeeded_at)} {feed.data?.status?.error}</p>{feed.error&&<p role="alert">{feed.error}</p>}
 <div className="insight-feed">{feed.data?.items.map(s=><article key={s.id}><div className="insight-profile-entry"><time>{when(s.observed_at)}</time><p>官网关注人数 {number(s.data.followers)} · 评分 {number(s.data.rating)} · {number(s.data.ratingCount)} 人评分</p>{!s.changes.length?<small className="muted">资料快照 · 无新增变化或首次基线</small>:s.changes.map((c,i)=><details key={i} open={c.field==='photos'}><summary>{c.label}{c.photos?` · ${c.photos.length} 张`:''}</summary>{c.photos?<div className="insight-photos">{c.photos.map(p=><a key={p.id} href={p.fullUrl||p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="新增公开照片" loading="lazy" referrerPolicy="no-referrer"/></a>)}</div>:<div className="insight-diff"><div><small>上次观察</small><pre>{show(c.before,c.field)}</pre></div><div><small>本次观察</small><pre>{show(c.after,c.field)}</pre></div></div>}</details>)}</div></article>)}</div>
 {feed.data&&!feed.data.items.length&&<p className="empty">关注后开始积累资料历史</p>}<div className="insight-actions">{before&&<button onClick={()=>setBefore('')}>返回最新</button>}{feed.data?.nextBefore&&<button onClick={()=>setBefore(feed.data.nextBefore)}>更早记录</button>}</div></section>;
}
