export const highlightDefaults={viewerRatio:0.3,viewerIncrease:50,tipMinimum:100,tipRatio:3,singleTip:500,goalRecord:true,goalNotify:false,goalNearPercent:1};
export function validateHighlightSettings(value={}){
 const out={...highlightDefaults};
 for(const [key,min,max] of [['viewerRatio',0.1,10],['viewerIncrease',1,1000000],['tipMinimum',1,10000000],['tipRatio',1,100],['singleTip',1,10000000]]){
  const n=value[key]??out[key];if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max||(!['viewerRatio','tipRatio'].includes(key)&&!Number.isInteger(n)))throw new Error('高光阈值无效');out[key]=n;
 }
 for(const key of ['goalRecord','goalNotify']){const v=value[key]??out[key];if(typeof v!=='boolean')throw new Error('目标监控选项必须是布尔值');out[key]=v;}
 const p=value.goalNearPercent??1;if(typeof p!=='number'||!Number.isFinite(p)||p<0.1||p>20)throw new Error('目标剩余比例须为 0.1–20%');out.goalNearPercent=p;
 return out;
}
// Require continuous observations from this buffer's lifetime, never pre-monitor history.
export function detectHighlight({now,since,observations,tips=[],coverage=[],settings=highlightDefaults}){
 const samples=observations.map(o=>({...o,t:new Date(o.observed_at).getTime()})).filter(o=>o.t>=since&&o.t<=now).sort((a,b)=>a.t-b.t);
 const last=samples.at(-1);if(!last||now-last.t>20000)return {ready:false,reasons:[]};
 let start=0;for(let i=0;i<samples.length;i++)if(samples[i].error||samples[i].viewers==null||!samples[i].online||samples[i].room_status!=='public'||(i&&samples[i].t-samples[i-1].t>20000))start=i+(samples[i].error||samples[i].viewers==null||!samples[i].online||samples[i].room_status!=='public'?1:0);
 const valid=samples.slice(start);if(!valid.length||now-valid[0].t<300000)return {ready:false,reasons:[]};
 const baseline=valid.filter(o=>o.t>=now-360000&&o.t<now-60000),recent=valid.filter(o=>o.t>=now-60000);
 const reasons=[];const mean=a=>a.reduce((n,o)=>n+Number(o.viewers),0)/a.length;
 if(baseline.length&&recent.length){const base=mean(baseline),current=mean(recent),sustained=valid.filter(o=>o.t>=now-25000);const threshold=Math.max(base*(1+settings.viewerRatio),base+settings.viewerIncrease);
  if(current>=threshold&&sustained.length>=3&&sustained.at(-1).t-sustained[0].t>=20000&&sustained.every(o=>o.viewers>=threshold))reasons.push({kind:'viewers',text:`人数 ${Math.round(base)} → ${Math.round(current)}`,baseline:base,value:current});
 }
 const covered=coverage.some(c=>new Date(c.started_at).getTime()<=now-330000&&new Date(c.ended_at||c.last_seen).getTime()>=now-10000&&!c.ended_at);
 if(covered){
  // Historical replays received on reconnect must not manufacture a live spike.
  const events=tips.filter(t=>t.source==='live'&&Number.isSafeInteger(Number(t.amount))&&Number(t.amount)>0&&Math.abs(new Date(t.received_at)-new Date(t.message_at))<30000);
  const latest=events.filter(t=>new Date(t.message_at).getTime()>now-30000&&new Date(t.message_at).getTime()<=now);
  const total=latest.reduce((n,t)=>n+Number(t.amount),0),prior=events.filter(t=>new Date(t.message_at).getTime()>now-330000&&new Date(t.message_at).getTime()<=now-30000).reduce((n,t)=>n+Number(t.amount),0)/10;
  if(total>=settings.tipMinimum&&total>=prior*settings.tipRatio)reasons.push({kind:'tips',text:`30 秒内 ${total} TK`,value:total,baseline:prior});
  const largest=Math.max(0,...latest.map(t=>Number(t.amount)));if(largest>=settings.singleTip)reasons.push({kind:'singleTip',text:`单笔 ${largest} TK`,value:largest});
 }
 return {ready:true,reasons};
}
