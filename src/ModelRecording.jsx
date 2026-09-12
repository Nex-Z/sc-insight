import React,{useState} from 'react';

export default function ModelRecording({models=[],initialTarget='',onChange,onCreated}){
 const [target,setTarget]=useState(initialTarget),[seconds,setSeconds]=useState(3600);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [automatic,setAutomatic]=useState(false);
 const [continuous,setContinuous]=useState(true);
 async function submit(preview){
  setBusy(true);setMessage('');
  try{
   const response=await fetch(preview?'/api/recording-target/resolve':'/api/recordings/by-target',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target:target.trim(),max_seconds:Number(seconds),auto_record:automatic,until_offline:automatic&&continuous})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'提交失败');
   if(preview)setMessage(`${data.name} · ID ${data.source_id}：${data.reason}`);
   else{setMessage(data.auto_record?'已启用上线自动录制，最高画质；下线后自动归档，下次上线继续。':`任务 #${data.id} 已排队，后台正在解析直播源。`);await onChange?.();onCreated?.();}
  }catch(e){setMessage(e.message);}finally{setBusy(false);}
 }
 return <section className="panel model-recording">
  <h2>按主播后台录制</h2><p className="muted">输入主播名称或已收录的平台 ID，通过 HTTP 解析并交给 FFmpeg。每次开录重新获取地址，默认最高可用画质。</p>
  <form onSubmit={e=>{e.preventDefault();void submit(false);}}>
   <label>主播名称 / 平台 ID<input required maxLength={80} list="recording-models" value={target} onChange={e=>setTarget(e.target.value)} placeholder="主播名称或平台 ID"/></label>
   <datalist id="recording-models">{models.map(m=><option key={m.id} value={m.name}>{m.source_id}</option>)}</datalist>
   {!(automatic&&continuous)&&<label>每段最长时长（秒）<input type="number" required min={5} max={21600} value={seconds} onChange={e=>setSeconds(e.target.value)}/></label>}
   <label className="auto-record-option"><input type="checkbox" checked={automatic} onChange={e=>setAutomatic(e.target.checked)}/>上线自动录制</label>
   {automatic&&<label className="auto-record-option"><input type="checkbox" checked={continuous} onChange={e=>setContinuous(e.target.checked)}/>不分段，录到下线</label>}
   <button type="button" disabled={busy||!target.trim()} onClick={()=>void submit(true)}>检查直播源</button>
   <button className="primary" disabled={busy} type="submit">{busy?'处理中…':automatic?'启用上线自动录制':'开始后台录制'}</button>
  </form>
  {message&&<p role="status">{message}</p>}
  {automatic&&continuous&&<p className="muted">不设固定录制时长，下线或手动停止时归档。网络中断恢复后可能产生新文件。</p>}
  {automatic&&<p className="muted">每分钟检查上线／下线；上线后按最高可用画质录制，下线自动归档并继续等待。手动停止任务会关闭自动录制。</p>}
  {models.filter(m=>m.auto_record).map(m=><p key={m.id}>{m.name} · {m.online?'已上线，自动录制已启用':'等待上线'} <button disabled={busy} onClick={async()=>{setBusy(true);try{const r=await fetch('/api/recording-sources/'+m.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({auto_record:false})});if(!r.ok)throw new Error('关闭失败');await onChange?.();}catch(e){setMessage(e.message);}finally{setBusy(false);}}}>关闭自动录制</button></p>)}
 </section>;
}
