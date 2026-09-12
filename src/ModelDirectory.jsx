import React,{useState,useRef,useEffect} from 'react';
import {filterDirectory} from './directory-filters.js';
const regionNames=new Intl.DisplayNames(['zh-CN'],{type:'region'});
function regionLabel(code){try{return code==='未知'?code:regionNames.of(code.toUpperCase())||code;}catch{return code;}}
export default function ModelDirectory({mode,models,Card,cardProps,onResults,initialQuery='',onDiscover}){
 const discover=mode==='discover';
 const [query,setQuery]=useState(initialQuery),[online,setOnline]=useState('all'),[sort,setSort]=useState('viewers');
 const [region,setRegion]=useState('all'),[group,setGroup]=useState('all'),[min,setMin]=useState(''),[max,setMax]=useState('');
 const [result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[page,setPage]=useState(1);
 const request=useRef(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 useEffect(()=>{if(discover)setQuery(initialQuery);},[initialQuery]);
 async function search(e){
  e.preventDefault();if(min!==''&&max!==''&&Number(min)>Number(max)){setError('最少观看人数不能大于最多观看人数');return;}request.current?.abort();const controller=new AbortController();request.current=controller;
  setBusy(true);setError('');setPage(1);
  try{const r=await fetch('/api/models/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:query.trim()}),signal:controller.signal});const data=await r.json();if(!r.ok)throw new Error(data.error);if(controller.signal.aborted)return;
   setResult({...data,online,sort,region,group,min,max});onResults(data);
  }catch(e){if(!controller.signal.aborted)setError(e.message);}finally{if(!controller.signal.aborted)setBusy(false);}
 }
 const options=discover?result:{online,sort,region,group,min,max};
 const rows=filterDirectory((discover?(result?.models||[]).map(m=>{const local=models.find(x=>x.id===m.id);return {...m,favorite:local?.favorite??m.favorite,monitored:local?.monitored??m.monitored};}):models.filter(m=>m.favorite&&m.name.toLowerCase().includes(query.trim().toLowerCase()))),options||{});
 const countries=[...new Set([...(discover?models:models.filter(m=>m.favorite)),...(result?.models||[])].map(m=>m.country).filter(Boolean))].sort();
 function reset(){request.current?.abort();setBusy(false);setError('');setQuery('');setOnline('all');setSort('viewers');setRegion('all');setGroup('all');setMin('');setMax('');setPage(1);if(discover)setResult(null);}
 const count=Math.max(1,Math.ceil(rows.length/12)),current=Math.min(page,count);
 return <section className="model-directory">
  <form className="panel directory-filters" onSubmit={discover?search:e=>e.preventDefault()}>
   <label>{discover?'官网用户名搜索':'搜索我的关注'}<input aria-label={discover?'官网用户名搜索':'搜索我的关注'} maxLength={80} required={discover} value={query} onChange={e=>{setQuery(e.target.value);if(!discover)setPage(1);}} placeholder="输入主播用户名"/></label>
   <label>在线状态<select aria-label="在线状态" value={online} onChange={e=>setOnline(e.target.value)}><option value="all">全部状态</option><option value="online">在线</option><option value="offline">离线</option><option value="unknown">待更新</option></select></label>
   <label>国家 / 地区<select aria-label="筛选地区" value={region} onChange={e=>setRegion(e.target.value)}><option value="all">全部地区</option>{countries.map(c=><option key={c} value={c}>{regionLabel(c)}</option>)}</select></label>
   <label>列表分组<select aria-label="列表分组" value={group} onChange={e=>setGroup(e.target.value)}><option value="all">全部</option>{discover&&<option value="favorite">我的关注</option>}<option value="monitored">监控名单</option></select></label>
   <label>最少观看人数<input aria-label="最少观看人数" type="number" min="0" step="1" value={min} onChange={e=>setMin(e.target.value)} placeholder="不限"/></label>
   <label>最多观看人数<input aria-label="最多观看人数" type="number" min="0" step="1" value={max} onChange={e=>setMax(e.target.value)} placeholder="不限"/></label>
   <label>排序<select aria-label="排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="viewers">观看人数</option><option value="growth">采样变化</option><option value="name">用户名</option></select></label>
   <button type="button" onClick={reset}>重置</button>
   {discover?<button className="primary" type="submit" disabled={busy||!query.trim()}>{busy?'搜索中…':'搜索官网'}</button>:<button type="button" onClick={onDiscover}>去发现主播</button>}
  </form>
  {discover&&<p className="footnote">条件筛选作用于本次官网返回的结果，点击搜索后生效；未提供地区或采样变化的资料不会补造数值。</p>}
  <p role="status" className="footnote">{error|| (discover?busy?'正在搜索官网…':result?`官网用户名搜索 · 女主播分类 · 返回 ${result.models.length} / ${result.total} 位 · 筛选后 ${rows.length} 位${result.skipped?` · 已略过 ${result.skipped} 条无法识别的资料`:``}`:'输入用户名并点击搜索；修改条件后再次点击搜索生效。':`我的关注 ${models.filter(m=>m.favorite).length} 位 · 在线 ${models.filter(m=>m.favorite&&m.online&&m.fresh).length} 位 · 状态和人数为最近采样，过期显示待更新`)}</p>
  <div className="model-grid">{rows.slice((current-1)*12,current*12).map(m=><Card key={m.id} m={m} {...cardProps}/>)}</div>
  {!rows.length&&!busy&&<div className="empty"><strong>{discover?result?'没有符合条件的主播':'搜索官网，发现主播':'暂无符合条件的关注主播'}</strong><span>{discover?'可按完整用户名搜索，在结果中点击关注。':'在发现主播中点击关注后，会出现在这里。'}</span></div>}
  {rows.length>0&&<div className="pagination"><button disabled={current<=1} onClick={()=>setPage(current-1)}>上一页</button><span>{current} / {count} · {rows.length} 位</span><button disabled={current>=count} onClick={()=>setPage(current+1)}>下一页</button></div>}
 </section>;
}
