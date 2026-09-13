import {useEffect,useState} from 'react';
export async function insightApi(path,body,method='POST'){
 const r=await fetch('/api'+path,body===undefined?undefined:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await r.json();if(!r.ok)throw Error(data.error||'读取失败');return data;
}
export function useInsight(path,interval=30000){
 const [data,setData]=useState(null),[error,setError]=useState(''),[version,setVersion]=useState(0);
 useEffect(()=>{let stopped=false,timer;setData(null);setError('');async function run(){try{const j=await insightApi(path);if(!stopped){setData(j);setError('');}}catch(e){if(!stopped)setError(e.message);}finally{if(!stopped&&interval)timer=setTimeout(run,interval);}}run();return()=>{stopped=true;clearTimeout(timer);};},[path,version,interval]);
 return {data,error,reload:()=>setVersion(v=>v+1)};
}
export const when=v=>v?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Hong_Kong',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
export const number=v=>v==null?'—':Number(v).toLocaleString('zh-CN',{maximumFractionDigits:1});
export const hours=v=>v==null?'—':v<60?number(v)+' 秒':v<3600?number(v/60)+' 分钟':number(v/3600)+' 小时';
export const fileUrl=m=>`/api/${m.kind==='highlight'?'highlights':'recordings'}/${m.id}/file`;
