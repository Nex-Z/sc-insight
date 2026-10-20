import React,{useState} from 'react';
import {Modal,MediaVideo} from './MediaDialog';
import {AutoRecordToggle} from './ModelRecordings.jsx';
const active=r=>['排队中','连接中','录制中','归档中'].includes(r.status);
const playable=r=>['已完成','已中断'].includes(r.status)&&Number(r.bytes)>0;
export default function RecordingWorkspace({models,recordings,onChange,onRecord,onStop}){
 const [query,setQuery]=useState(''),[selected,setSelected]=useState(null),[stopping,setStopping]=useState(null);
 const running=recordings.filter(active),automatic=models.filter(m=>m.auto_record);
 const rows=recordings.filter(r=>`${r.name||''} ${r.filename||''}`.toLowerCase().includes(query.toLowerCase()));
 return <div className="recording-workspace">
  <div className="workspace-toolbar"><p><strong>{running.length}</strong> 个进行中 · <strong>{automatic.length}</strong> 位主播自动录制</p><button className="primary" onClick={onRecord}>新建录制任务</button></div>
  <section className="panel"><div className="panel-head"><h3>录制与归档记录</h3><a href="#library">前往内容库整理 →</a></div><label className="recording-search">搜索任务<input aria-label="搜索录像" placeholder="主播名称或文件名" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <div className="recording-task-list">{rows.map(r=><article className="recording-task" key={r.id}><div><h3>{r.name||'浏览器媒体'} <span className="md-badge">{r.status}</span></h3><p>{new Date(r.started_at||r.created_at).toLocaleString('zh-CN')} · {r.duration||'—'} · {r.size||'—'}</p><small>{r.filename||`任务 #${r.id}`}</small>{r.error&&<p className="muted">{r.error}</p>}</div><div className="insight-actions">{active(r)&&<button disabled={stopping===r.id||r.status==='归档中'} onClick={async()=>{setStopping(r.id);try{await onStop(r.id);}finally{setStopping(null);}}}>{stopping===r.id?'停止中…':r.status==='归档中'?'正在保存':'停止录制'}</button>}{playable(r)&&<><button className="primary" onClick={()=>setSelected(r)}>播放</button><a className="action-link" href={`/api/recordings/${r.id}/file?download=1`} download>下载</a></>}</div></article>)}</div>
   {!rows.length&&<p className="empty">{recordings.length?'没有匹配的录制任务':'暂无录制任务，点击“新建录制任务”开始。'}</p>}
  </section>
  <section className="panel"><div className="panel-head"><h3>上线自动录制</h3><span className="muted">开关即时生效</span></div>{automatic.length?automatic.map(m=><div className="automation-row" key={m.id}><a href={`#detail/${m.id}`}>{m.name}</a><AutoRecordToggle model={m} onChange={onChange}/></div>):<p className="footnote">新建录制任务时可启用自动录制；也可以在主播详情中开启。</p>}<p className="footnote">关闭自动录制只停止后续自动开录。正在进行的任务可在上方单独停止。</p></section>
  {selected&&<Modal title={`${selected.name||'媒体'} · 录像`} onClose={()=>setSelected(null)}><div className="insight-actions"><a className="action-link" href={`/api/recordings/${selected.id}/file?download=1`} download>下载原视频</a></div><MediaVideo autoPlay src={`/api/recordings/${selected.id}/file`}/></Modal>}
 </div>;
}
