import React,{useEffect,useState} from 'react';
import HighlightSettings from './HighlightSettings';
const when=value=>value?new Date(value).toLocaleString('zh-CN'):'—';
export default function ModelHighlights({model,onChange}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState(null),[before,setBefore]=useState(null),[pages,setPages]=useState([]),[draft,setDraft]=useState(null),[version,setVersion]=useState(0);
 useEffect(()=>{let stopped=false,timer;const controller=new AbortController();
  async function load(){try{const r=await fetch(`/api/models/${model.id}/highlights${before?'?before='+before:''}`,{signal:controller.signal});const j=await r.json();if(!r.ok)throw new Error(j.error||'高光读取失败');if(!stopped){setData(j);setError('');}}catch(e){if(!stopped)setError(e.message);}finally{if(!stopped)timer=setTimeout(load,5000);}}
  void load();return()=>{stopped=true;controller.abort();clearTimeout(timer);};
 },[model.id,before,version]);
 async function save(enabled,config=data.config){setBusy(true);setError('');try{const r=await fetch(`/api/models/${model.id}/highlights`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled,config})});const j=await r.json();if(!r.ok)throw new Error(j.error||'设置失败');setData(d=>({...d,enabled:j.enabled,config:j.config}));setDraft(null);setVersion(v=>v+1);onChange?.();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="md-section model-highlights">
  <div className="md-section-title"><h2>高光时刻</h2><label className="highlight-toggle"><input type="checkbox" checked={!!data?.enabled} disabled={!data||busy} onChange={e=>save(e.target.checked)}/>高光录制</label></div>
  {data&&<HighlightSettings data={data} busy={busy} save={save} draft={draft} setDraft={setDraft}/>}
  {data&&<div className="highlight-status"><span className="md-badge">{data.enabled?data.state.status:'已关闭'}</span>{data.enabled&&data.state.error&&<span role="alert">{data.state.error}</span>}</div>}
  {error&&<p className="error-banner" role="alert">{error}</p>}
  {selected&&<div className="highlight-player"><div><strong>{when(selected.triggered_at)}</strong><button onClick={()=>setSelected(null)}>关闭播放</button></div><video key={selected.id} controls autoPlay playsInline src={`/api/highlights/${selected.id}/file`} onError={()=>setError('片段暂不可播放，请检查文件是否可用。')}/></div>}
  <div className="highlight-list">{data?.items.map(h=><article key={h.id} className="highlight-item"><div><time>{when(h.triggered_at)}</time><h3>{h.reasons.map(r=>r.text).join(' · ')||'高光时刻'}</h3><p>{h.status}{h.duration_seconds>0?` · ${Math.floor(h.duration_seconds/60)} 分 ${Math.round(h.duration_seconds%60)} 秒`:''}{h.started_at?` · 片段开始 ${when(h.started_at)}`:''}</p>{h.error&&<small>{h.error}</small>}</div>{['已完成','已中断'].includes(h.status)&&Number(h.bytes)>0&&<div className="highlight-actions"><button onClick={()=>{setError('');setSelected(h);}}>播放高光</button><a href={`/api/highlights/${h.id}/file?download=1`}>下载</a></div>}</article>)}</div>
  {!data&&!error&&<div className="empty">正在读取高光…</div>}{data&&!data.items.length&&<div className="empty">尚无高光片段。开启后，系统会在监测到热度变化时自动保留。</div>}
  {data&&<div className="highlight-pagination">{before&&<button onClick={()=>{const next=[...pages];setBefore(next.pop()||null);setPages(next);setSelected(null);}}>上一页</button>}{data.nextBefore&&<button onClick={()=>{setPages(p=>[...p,before]);setBefore(data.nextBefore);setSelected(null);}}>更早高光</button>}</div>}
 </section>;
}
