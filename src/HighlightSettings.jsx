import React from 'react';
export default function HighlightSettings({data,busy,save,draft,setDraft}){
 const c=data.config;
 const choices=[['viewerRecord','人数变多','涨人突然加速并持续一段时间，保留前 2 分钟到后 3 分钟。'],['tipRecord','打赏变多','短时间打赏激增，或收到大额打赏，保留前 2 分钟到后 3 分钟。'],['goalRecord','目标完成',`目标剩余 ≤ ${c.goalNearPercent}% 或突然完成，录到完成后 15 分钟。`]];
 const field=(key,label,min,max,step=1,scale=1)=><label>{label}<input required type="number" min={min} max={max} step={step} value={draft[key]===''?'':Number((draft[key]*scale).toFixed(6))} onChange={e=>setDraft(d=>({...d,[key]:e.target.value===''?'':Number(e.target.value)/scale}))}/></label>;
 return <>
  <p className="highlight-explainer">选中的任意一项触发就录制，同时触发也只录一份。</p>
  {data.capacity&&<p className="highlight-explainer">高光缓存占用 {data.capacity.active} / {data.capacity.concurrency} 路{!data.enabled&&data.capacity.active>=data.capacity.concurrency?' · 当前已满，开启后需等待名额':''} · <a href="#settings">调整容量</a></p>}
  <div className="highlight-choices">{choices.map(([key,title,description])=><label className="highlight-choice" key={key}><input type="checkbox" aria-label={title} checked={c[key]!==false} disabled={busy} onChange={e=>save(data.enabled,{...c,[key]:e.target.checked})}/><span><strong>{title}</strong><small>{description}</small></span></label>)}</div>
  <div className="goal-controls"><label className="highlight-toggle"><input type="checkbox" checked={c.goalNotify} disabled={busy} onChange={e=>save(data.enabled,{...c,goalNotify:e.target.checked})}/>目标即将完成提醒</label><span className="highlight-explainer">控制接近完成提醒；关注或监控后，目标完成自动生成站内通知。</span>{data.goal&&<p className="highlight-explainer">{data.goal.error||Date.now()-new Date(data.goal.updated_at)>30000?'目标数据待更新':data.goal.state?.available?`${data.goal.state.goal?.description||'当前目标'} · ${data.goal.state.completed?'已完成':`剩余 ${Number(data.goal.state.remaining?.toFixed(2))}%`}`:'当前未观察到公开目标'}</p>}</div>
  <div className="highlight-options"><button aria-expanded={!!draft} disabled={busy} onClick={()=>setDraft(draft?null:{...c})}>{draft?'收起高级设置':'高级设置'}</button><details><summary>录制规则</summary><p className="highlight-explainer">开启后自动持续缓存视频并加快该主播的数据采集。人数和打赏先观察 5 分钟，避开刚接入时的上涨；目标独立监控。前置画面以已有缓存为限。开票、私聊等无法获取画面时结束录制，已保留的片段仍可查看。</p></details></div>
  {draft&&<form className="highlight-settings" onSubmit={e=>{e.preventDefault();void save(data.enabled,draft);}}>
   <fieldset><legend>人数变多 · 同时满足</legend><p>先排除原有上涨趋势。人数超过按此前走势预计的人数，同时达到以下增幅和增加人数，并持续至少 20 秒。</p><div>{field('viewerRatio','人数增幅（%）',10,1000,0.1,100)}{field('viewerIncrease','人数至少增加',1,1000000)}</div></fieldset>
   <fieldset><legend>打赏变多 · 满足任一种</legend><p>30 秒内打赏同时达到以下金额和倍数：</p><div>{field('tipMinimum','30 秒打赏至少（TK）',1,10000000)}{field('tipRatio','达到平时的倍数',1,100,0.1)}</div><p>或者，收到一笔大额打赏：</p><div>{field('singleTip','单笔打赏至少（TK）',1,10000000)}</div></fieldset>
   <fieldset><legend>目标完成</legend><p>剩余比例达到设定值，或目标突然完成，即可触发录制或提醒。</p><div>{field('goalNearPercent','目标剩余比例（%）',0.1,20,0.1)}</div></fieldset>
   <button className="primary" disabled={busy}>保存设置</button>
  </form>}
 </>;
}
