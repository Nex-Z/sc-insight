import React,{useEffect,useState} from 'react';
import {currentBroadcast} from './live-session.js';
const number=n=>n==null?'—':Math.round(Number(n)).toLocaleString('zh-CN');
const duration=s=>s==null?'—':`${Math.floor(s/3600)}h ${Math.floor(s%3600/60)}m`;
export default function LiveSessionStats({model,refreshSeconds=5}){
 const [data,setData]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let closed=false,timer;const abort=new AbortController();setData(null);setError('');async function load(){try{const r=await fetch(`/api/models/${model.id}/broadcasts?days=7`,{signal:abort.signal});const j=await r.json();if(!r.ok)throw Error(j.error||'读取失败');if(!closed){setData(j);setError('');}}catch(e){if(!closed)setError(e.message);}finally{if(!closed)timer=setTimeout(load,refreshSeconds*1000);}}load();return()=>{closed=true;abort.abort();clearTimeout(timer);};},[model.id,refreshSeconds]);
 const session=currentBroadcast(data?.sessions,model,refreshSeconds),chat=!!session&&(session.chat_observed||session.messages>0||session.tips>0);
 const values=[['当前观看',model.fresh?number(model.viewers):'—','当前采样'],['本场覆盖时长',duration(session?.observed_seconds),'仅计有效采样区间'],['观看峰值 / 均值',`${number(session?.peak_viewers)} / ${number(session?.average_viewers)}`,'本场采样'],['已收集弹幕',chat?number(session.messages):'—',chat?`${number(session.speakers)} 位发言用户`:'等待聊天采集'],['公开打赏 TK',chat?number(session.tokens):'—','已观察到的金额'],['打赏次数',chat?number(session.tips):'—','公开可见事件']];
 return <section className="live-session-stats" aria-label="本场直播数据"><header><h2>本场直播</h2><span>{session?`${session.start_known?'观察到开播':'首次观察在线'} ${new Date(session.first_seen).toLocaleString('zh-CN',{timeZone:'Asia/Hong_Kong',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})} · UTC+8`:data?'暂无当前场次记录':'正在读取场次…'}</span></header><div className="live-session-metrics">{values.map(([label,value,sub])=><div key={label}><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>)}</div>{error?<p role="status">本场数据更新失败：{error}</p>:!session&&data?<p>{model.favorite||model.monitored?'等待新的有效场次采样':'关注或监控此主播后，将持续记录场次与互动数据。'}</p>:session?.incomplete?<p>本场记录不完整，以上为已采集数据。</p>:null}</section>;
}
