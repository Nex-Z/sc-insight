import React,{useEffect,useState} from 'react';
import {Modal} from './MediaDialog';
import {usePublicInfo} from './PublicModelInfo';
function MenuReference({model,onClose,onPick}){
 const {data,error,retry}=usePublicInfo(model.id,'public-profile',300000);
 const unavailable=data?.unavailable?.includes('menu');
 return <Modal title={`${model.name} · 小费菜单参考`} onClose={onClose} className="highlight-menu-dialog"><p>按 TK 价格从低到高排列，点击价格可填入当前门槛；保存后生效。</p>{error||unavailable?<p role="alert">{error||'菜单暂不可用'} <button onClick={retry}>重试</button></p>:!data?<p>正在读取主播菜单…</p>:!data.menu?.enabled?<p>主播未开启公开菜单</p>:!data.menu.items?.length?<p>暂无公开菜单项目</p>:<div className="highlight-menu-items">{[...data.menu.items].sort((a,b)=>a.price-b.price).map((item,i)=><div key={i}><span>{item.activity}</span><button type="button" disabled={!Number.isInteger(item.price)||item.price<1||item.price>10000000} onClick={()=>onPick(item.price)}>{item.price} TK</button></div>)}</div>}<p className="highlight-explainer">价格仅供参考。菜单打赏以平台标记为准，不按金额匹配项目；数据可能有约 5 分钟缓存。</p></Modal>;
}
export default function TipHighlightSettings({model,data,busy,save}){
 const c=data.config;
 const values=()=>({plainTipRecord:c.plainTipRecord??false,menuTipRecord:c.menuTipRecord??false,plainTipMinimum:c.plainTipMinimum??500,menuTipMinimum:c.menuTipMinimum??500});
 const [form,setForm]=useState(values),[reference,setReference]=useState(null);
 useEffect(()=>{setForm(values());setReference(null);},[model.id,c.plainTipRecord,c.menuTipRecord,c.plainTipMinimum,c.menuTipMinimum]);
 return <form className="highlight-single-tips" onSubmit={e=>{e.preventDefault();void save(data.enabled,{...c,...form});}}><div className="md-section-title"><h3>单笔金额触发</h3><span>达到或超过门槛即满足</span></div><div className="highlight-tip-rules">{[['plainTipRecord','plainTipMinimum','普通小费'],['menuTipRecord','menuTipMinimum','菜单打赏']].map(([enabled,minimum,label])=><div className="highlight-tip-rule" key={enabled}><label className="highlight-toggle"><input type="checkbox" checked={form[enabled]} disabled={busy} onChange={e=>setForm(v=>({...v,[enabled]:e.target.checked}))}/>{label}</label><label>单笔至少（TK）<input aria-label={`${label}单笔至少（TK）`} type="number" min="1" max="10000000" step="1" required value={form[minimum]} disabled={busy} onChange={e=>setForm(v=>({...v,[minimum]:e.target.value===''?'':Number(e.target.value)}))}/></label><button type="button" disabled={busy} onClick={()=>setReference(minimum)}>查看主播菜单</button></div>)}</div><p className="highlight-explainer">按主播独立设置，默认关闭。沿用打赏监测的 5 分 30 秒连续聊天预热；触发后录制 3 分钟。若只想按单笔门槛录制，请关闭上方“打赏变多”，它仍会合并统计所有公开打赏。</p><button className="primary" disabled={busy}>保存单笔条件</button>{reference&&<MenuReference model={model} onClose={()=>setReference(null)} onPick={price=>{setForm(v=>({...v,[reference]:price}));setReference(null);}}/>}</form>;
}
