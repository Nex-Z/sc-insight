import React,{useEffect,useState} from 'react';
const timestamp=v=>v?new Date(v).toLocaleString('zh-CN'):'—';
const duration=s=>`${Math.floor(Number(s||0)/3600)}小时 ${Math.floor(Number(s||0)%3600/60)}分`;
export default function BroadcastHistory({modelId,refreshSeconds=5}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[days,setDays]=useState(30);
 useEffect(()=>{let stopped=false,timer;const controller=new AbortController();setData(null);async function load(){try{const r=await fetch(`/api/models/${modelId}/broadcasts?days=${days}`,{signal:controller.signal});const j=await r.json();if(!r.ok)throw new Error(j.error);if(!stopped){setData({...j,daily:j.daily.map(d=>({...d,observed_seconds:d.weighted_viewers==null?0:d.observed_seconds}))});setError('');}}catch(e){if(!stopped)setError(e.message);}finally{if(!stopped)timer=setTimeout(load,refreshSeconds*1000);}}void load();return()=>{stopped=true;controller.abort();clearTimeout(timer);};},[modelId,days,refreshSeconds]);
 const latest=data?.sessions[0];
 return <section className="panel broadcast-history"><div className="panel-head"><h3>直播场次与采样分析</h3><select aria-label="直播分析时间范围" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>近 7 天</option><option value={30}>近 30 天</option><option value={90}>近 90 天</option></select></div>
 {error&&<p role="alert">{error}</p>}{!data?<p>正在读取场次记录…</p>:<>
 <div className="stats four"><div className="stat"><div><span>最近观察到开播</span><strong style={{fontSize:16}}>{timestamp(latest?.first_seen)}</strong><small>{latest?latest.start_known?'观察到离线转在线，仍存在轮询误差':'首次发现时已在线，真实开播时间未知':'启用关注或监控后开始积累'}</small></div></div><div className="stat"><div><span>所选期间已覆盖在线时长</span><strong style={{fontSize:20}}>{duration(data.daily.reduce((s,d)=>s+d.observed_seconds,0))}</strong><small>不包含采集空白，不等于完整直播时长</small></div></div><div className="stat"><div><span>成功采样 / 失败</span><strong>{data.quality.samples} / {data.quality.failures}</strong><small>最后成功：{timestamp(data.quality.last_success)}</small></div></div><div className="stat"><div><span>最近场次采样峰值</span><strong>{latest?.peak_viewers??'—'}</strong><small>观看人数，非独立访客数</small></div></div></div>
 <p className="footnote">场次表展示最近 100 条，时间为观察时间。首次在线、采集缺口或失败会标注不完整；未结束的场次只表示最后一次观察在线。</p>
 <div style={{overflowX:'auto'}}><table><thead><tr><th>首次观察在线</th><th>结束观察 / 最后在线</th><th>覆盖时长</th><th>峰值 / 样本均值</th><th>记录完整性</th></tr></thead><tbody>{data.sessions.map(s=><tr key={s.id}><td>{timestamp(s.first_seen)}</td><td>{timestamp(s.ended_at||s.last_seen)}<small className="block">{s.end_reason==='offline_observed'?'观察到下线':s.end_reason==='observation_gap'?'采集缺口，真实下播未知':'最后观察在线'}</small></td><td>{duration(s.observed_seconds)}</td><td>{s.peak_viewers} / {Math.round(s.average_viewers||0)}</td><td>{s.incomplete?'不完整':s.end_known?'观察到开播与下播':'待下播确认'}<small className="block">{s.samples} 次在线采样</small></td></tr>)}</tbody></table></div>
 {!data.sessions.length&&<p className="footnote">暂无直播场次，不会补造启用前的历史。</p>}
 <details><summary>每日覆盖时长与时间加权人数</summary><table><thead><tr><th>日期（UTC+8）</th><th>在线覆盖</th><th>加权平均人数</th></tr></thead><tbody>{data.daily.map(d=><tr key={d.day}><td>{String(d.day).slice(0,10)}</td><td>{duration(d.observed_seconds)}</td><td>{d.weighted_viewers==null?'无有效在线区间':Math.round(d.weighted_viewers)}</td></tr>)}</tbody></table></details>
 <details><summary>最近房间状态变化</summary>{data.changes.map((c,i)=><p key={i}>{timestamp(c.observed_at)} · {c.previous_status} → {c.room_status}</p>)}</details>
 <a href={`/api/models/${modelId}/observations`} target="_blank" rel="noreferrer">查看原始采样 JSON（分页，供后续分析）</a>
 </> }</section>;
}
