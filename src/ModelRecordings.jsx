import React,{useEffect,useState} from 'react';
export function AutoRecordToggle({model,onChange}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function toggle(){setBusy(true);setError('');try{const r=await fetch(model.auto_record?`/api/recording-sources/${model.id}`:'/api/recordings/by-target',{method:model.auto_record?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(model.auto_record?{auto_record:false}:{target:model.name,auto_record:true,until_offline:true,max_seconds:3600})});const j=await r.json();if(!r.ok)throw Error(j.error||'保存失败');await onChange();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <div className="md-auto-record" title="最高画质 · 录到下线 · 关闭开关不停止当前录制"><label className="auto-record-choice" aria-busy={busy}><input type="checkbox" aria-label="上线自动录制" checked={!!model.auto_record} disabled={busy} onChange={toggle}/><span>{busy?'保存中…':'上线自动录制'}</span></label>{error&&<p role="alert">{error}</p>}</div>;
}
export default function ModelRecordings({model,recordings=[]}){
 const [limit,setLimit]=useState(8);
 useEffect(()=>{setLimit(8);},[model.id]);
 const rows=recordings.filter(r=>String(r.model_id)===String(model.id)).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));

 return <section className="md-section md-recordings"><div className="md-section-title"><h2>录制档案 <small>{rows.length}</small></h2></div><div className="md-table"><table><thead><tr><th>开始时间 / 文件</th><th>时长</th><th>大小</th><th>状态</th><th>操作</th></tr></thead><tbody>{rows.slice(0,limit).map(r=><tr key={r.id}><td>{new Date(r.started_at||r.created_at).toLocaleString('zh-CN',{timeZone:'Asia/Hong_Kong'})}<small className="block">{r.filename||`任务 #${r.id}`}</small></td><td>{r.duration||'—'}</td><td>{r.size||'—'}</td><td title={r.error||''}>{r.status}</td><td>{['已完成','已中断'].includes(r.status)&&Number(r.bytes)>0?<><a target="_blank" rel="noreferrer" href={`/api/recordings/${r.id}/file`}>播放</a><a href={`/api/recordings/${r.id}/file?download=1`}>下载</a></>:'—'}</td></tr>)}</tbody></table></div>{!rows.length&&<div className="empty">暂无录制记录</div>}{rows.length>limit&&<button onClick={()=>setLimit(n=>n+12)}>显示更多</button>}</section>;
}
