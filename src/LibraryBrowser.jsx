import React,{useEffect,useRef,useState} from 'react';
import {Modal,MediaVideo} from './MediaDialog';
import {insightApi,useInsight,when,fileUrl,hours} from './insight-api.js';
const key=m=>`${m.kind}:${m.id}`;
const active=m=>['排队中','连接中','录制中','归档中'].includes(m.status);
const playable=m=>['已完成','已中断'].includes(m.status)&&Number(m.bytes)>0;
const size=v=>{const n=Number(v)||0;return n>=1073741824?(n/1073741824).toFixed(2)+' GB':n>=1048576?(n/1048576).toFixed(1)+' MB':(n/1024).toFixed(1)+' KB';};
const defaults={q:'',kind:'',view:'',from:'',to:'',duration:'',status:'',sort:'newest',session:''};

function DeleteSelection({items,onClose,onDone}){
 const [busy,setBusy]=useState(false),[result,setResult]=useState(null),[progress,setProgress]=useState(0);
 async function remove(){
  setBusy(true);const deleted=[],failed=[],warnings=[];
  for(const [i,item] of items.entries()){
   try{const r=await insightApi(`/content/${item.kind}/${item.id}`,{confirm:true,protectFavorite:true},'DELETE');deleted.push(key(item));if(r.warning)warnings.push(`${item.title||item.name||item.filename}：${r.warning}`);}
   catch(e){failed.push(`${item.title||item.name||item.filename} #${item.id}：${e.message}`);}
   setProgress(i+1);
  }
  setResult({deleted,failed,warnings});setBusy(false);
 }
 return <Modal title="确认批量清理" onClose={()=>result?onDone(result):onClose()} busy={busy} alert className="delete-media-dialog">
  {!result?<><p>将永久删除 <strong>{items.length} 条</strong>内容，预计释放 <strong>{size(items.reduce((s,m)=>s+Number(m.bytes||0),0))}</strong>。</p><p>视频及其标题、标签、备注和时间标记会一起删除，无法撤销。收藏和录制中的内容会跳过。</p><details><summary>查看待删除内容</summary><ul>{items.map(m=><li key={key(m)}>{m.title||m.name||m.filename} · {m.kind==='highlight'?'高光':'录像'} #{m.id} · {when(m.started_at||m.created_at)} · {size(m.bytes)}</li>)}</ul></details><div className="insight-actions"><button disabled={busy} onClick={onClose}>取消</button><button className="danger-action" disabled={busy} onClick={remove}>{busy?`正在删除 ${progress} / ${items.length}`:'确认永久删除'}</button></div></>:<><p role="status">已删除 {result.deleted.length} 条，未删除 {result.failed.length} 条。</p>{result.failed.map((e,i)=><p role="alert" key={i}>{e}</p>)}{result.warnings.map((e,i)=><p role="alert" key={i}>{e}</p>)}<button onClick={()=>onDone(result)}>完成</button></>}
 </Modal>;
}

export default function LibraryBrowser({model,initialKind,initialId,Editor}){
 const [filters,setFilters]=useState(()=>({...defaults,kind:initialId?'':initialKind||''})),[offset,setOffset]=useState(0),[checked,setChecked]=useState([]),[queue,setQueue]=useState([]),[selected,setSelected]=useState(null),[editing,setEditing]=useState(false),[deleting,setDeleting]=useState(null),[notice,setNotice]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[overrides,setOverrides]=useState({});
 const lock=useRef(false),player=useRef(null),library=useRef(null);
 const [removed,setRemoved]=useState([]);
 const feed=useInsight('/content?'+new URLSearchParams({...filters,model:model?.id||'',offset}),10000,true);
 const items=(feed.data?.items||[]).filter(m=>!removed.includes(key(m))).map(m=>({...m,...overrides[key(m)]}));
 const current=selected?{...selected,...overrides[key(selected)]}:null;
 const index=current?queue.findIndex(m=>key(m)===key(current)):-1;
 const eligible=items.filter(m=>!active(m)&&!m.favorite);
 const chosen=items.filter(m=>checked.includes(key(m)));
 function filter(patch){setFilters(f=>({...f,...patch}));setOffset(0);setChecked([]);setError('');}
 function page(n){setOffset(n);setChecked([]);library.current?.scrollIntoView({block:'start'});}
 function open(m){setQueue(playable(m)?items.filter(playable):[m]);setSelected(m);setEditing(false);setError('');}
 useEffect(()=>{if(deleting)player.current?.pause();},[deleting]);
 useEffect(()=>{
  if(!feed.data)return;
  const latest=new Map(feed.data.items.map(m=>[key(m),m]));
  setQueue(q=>q.map(m=>latest.get(key(m))||m));setSelected(m=>m?(latest.get(key(m))||m):null);
  setOverrides(o=>Object.fromEntries(Object.entries(o).filter(([k])=>!latest.has(k))));
 },[feed.data]);
 useEffect(()=>{let stopped=false;if(initialKind&&initialId)insightApi(`/content/${initialKind}/${initialId}`).then(m=>{if(!stopped){setQueue([m]);setSelected(m);}}).catch(e=>{if(!stopped)setError(e.message);});return()=>{stopped=true;};},[initialKind,initialId]);
 useEffect(()=>{if(feed.data&&!feed.data.items.length&&offset>0){setOffset(n=>Math.max(0,n-24));setChecked([]);}},[feed.data,offset]);
 async function mark(targets,patch){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');let count=0;const failures=[];
  try{for(const item of targets){try{const saved=await insightApi(`/content/${item.kind}/${item.id}`,patch,'PATCH');setOverrides(o=>({...o,[key(item)]:{favorite:saved.favorite,watched:saved.watched}}));count++;}catch(e){failures.push(`${item.name||item.filename}：${e.message}`);}}
   setNotice(`已更新 ${count} 条内容`);setError(failures.join('；'));setChecked([]);feed.reload();
  }finally{lock.current=false;setBusy(false);}
 }
 function finishDelete(result){
  setRemoved(r=>[...r,...result.deleted]);
  const removed=new Set(result.deleted);setDeleting(null);setChecked(c=>c.filter(k=>!removed.has(k)));setQueue(q=>q.filter(m=>!removed.has(key(m))));
  if(current&&removed.has(key(current))){const next=queue.slice(index+1).find(m=>!removed.has(key(m)))||queue.slice(0,index).reverse().find(m=>!removed.has(key(m)));setSelected(next||null);}
  setNotice(`已删除 ${result.deleted.length} 条，未删除 ${result.failed.length} 条`);feed.reload();
 }
 const pagination=position=><nav className={`library-pagination library-pagination-${position}`} aria-label={position==='top'?'列表顶部分页':'列表底部分页'}>{offset>0&&<button onClick={()=>page(Math.max(0,offset-24))}>上一页</button>}<span>{feed.data?.total!=null?`共 ${feed.data.total} 条 · 录像 ${feed.data.recordingCount} 条 · 高光 ${feed.data.highlightCount} 条 · 第 ${feed.data.total?Math.floor(offset/24)+1:0} / ${feed.data.totalPages} 页`:`第 ${Math.floor(offset/24)+1} 页 · 本页 ${items.length} 条`}</span>{feed.data?.nextOffset!=null&&<button onClick={()=>page(feed.data.nextOffset)}>下一页</button>}</nav>;
 return <div className="insight-library" ref={library}>
  <section className="md-section library-browser"><div className="md-section-title"><h2>{model?'主播内容库':'个人内容库'}</h2><span>看完即整理 · 收藏保留，勾选清理</span></div>
   {pagination('top')}
   <div className="library-views" aria-label="快捷筛选">{[['','全部'],['unwatched','待看'],['favorite','收藏'],['cleanup','已看未收藏']].map(([v,label])=><button key={v} aria-pressed={filters.view===v} onClick={()=>filter({view:v})}>{label}</button>)}<button aria-pressed={filters.duration==='short'} onClick={()=>filter({duration:filters.duration==='short'?'':'short'})}>不足 1 分钟</button><button aria-pressed={filters.status==='failed'} onClick={()=>filter({status:filters.status==='failed'?'':'failed'})}>失败记录</button></div>
   <div className="insight-filters"><input aria-label="搜索内容" placeholder="搜索主播、标题、标签或触发原因" value={filters.q} onChange={e=>filter({q:e.target.value})}/><select aria-label="内容类型" value={filters.kind} onChange={e=>filter({kind:e.target.value})}><option value="">高光与录像</option><option value="highlight">高光</option><option value="recording">录像</option></select><select aria-label="排序方式" value={filters.sort} onChange={e=>filter({sort:e.target.value})}><option value="newest">最新在前</option><option value="oldest">最早在前</option><option value="largest">文件最大</option><option value="longest">时长最长</option></select><button onClick={()=>filter(defaults)}>重置筛选</button></div>
   <details className="library-more-filters"><summary>日期、时长与状态筛选{[filters.from,filters.to,filters.duration,filters.status,filters.session].filter(Boolean).length>0?' · 已启用':''}</summary><div className="insight-filters"><label>开始日期<input aria-label="开始日期" type="date" value={filters.from} onChange={e=>filter({from:e.target.value})}/></label><label>结束日期<input aria-label="结束日期" type="date" value={filters.to} onChange={e=>filter({to:e.target.value})}/></label><select aria-label="内容时长" value={filters.duration} onChange={e=>filter({duration:e.target.value})}><option value="">全部时长</option><option value="short">不足 1 分钟</option><option value="medium">1–10 分钟</option><option value="long">10 分钟及以上</option></select><select aria-label="内容状态" value={filters.status} onChange={e=>filter({status:e.target.value})}><option value="">全部状态</option><option value="playable">可播放</option><option value="active">录制 / 归档中</option><option value="failed">失败</option></select><input aria-label="内容场次 ID" type="number" min="1" placeholder="场次 ID（可选）" value={filters.session} onChange={e=>filter({session:e.target.value})}/></div></details>
   <div className="library-batch"><label><input type="checkbox" aria-label="全选本页可清理内容" disabled={!eligible.length||busy} checked={eligible.length>0&&eligible.every(m=>checked.includes(key(m)))} onChange={e=>setChecked(e.target.checked?eligible.map(key):[])}/>全选本页可清理内容</label><span>已选 {chosen.length} 条 · {size(chosen.reduce((s,m)=>s+Number(m.bytes||0),0))}</span><button disabled={!chosen.length||busy} onClick={()=>mark(chosen,{favorite:true})}>收藏所选</button><button disabled={!chosen.length||busy} onClick={()=>mark(chosen,{watched:true})}>标记已看</button><button className="danger-action" disabled={!chosen.some(m=>!active(m)&&!m.favorite)||busy} onClick={()=>setDeleting(chosen.filter(m=>!active(m)&&!m.favorite))}>清理所选</button>{checked.length>0&&<button onClick={()=>setChecked([])}>取消选择</button>}</div>
   <p className="muted">全选仅选择本页未收藏、已结束的内容。清理前可核对明细。</p>
   {notice&&<p role="status">{notice}</p>}{(error||feed.error)&&<p role="alert">{error||feed.error}</p>}
   {!feed.data&&!feed.error&&<p className="empty">正在读取内容…</p>}
   <div className="insight-feed">{items.map(m=><article key={key(m)} className="library-row"><input type="checkbox" aria-label={`选择 ${m.title||m.name||m.filename} ${m.kind} ${m.id}`} checked={checked.includes(key(m))} disabled={busy} onChange={e=>setChecked(c=>e.target.checked?[...c,key(m)]:c.filter(k=>k!==key(m)))}/><div className="library-row-info"><time>{when(m.started_at||m.created_at)}</time><h3>{m.title||m.name||m.filename}</h3><p>{m.kind==='highlight'?'高光':'录像'} · {m.status} · {hours(m.duration_seconds)} · {size(m.bytes)} · {m.watched?'已看':'未看'}</p><small>{m.tags.join(' · ')||m.reasons.map(r=>r.text).join(' · ')}</small></div><div className="content-row-actions"><button className="primary" onClick={()=>open(m)}>{playable(m)?'播放':'查看'}</button><button aria-pressed={m.favorite} disabled={busy} onClick={()=>mark([m],{favorite:!m.favorite})}>{m.favorite?'♥ 已收藏':'♡ 收藏'}</button><button aria-pressed={m.watched} disabled={busy} onClick={()=>mark([m],{watched:!m.watched})}>{m.watched?'已看':'标记已看'}</button><button disabled={active(m)||m.favorite||busy} title={m.favorite?'取消收藏后可清理':active(m)?'录制结束后可清理':'删除此内容'} onClick={()=>setDeleting([m])}>删除内容</button></div></article>)}</div>
   {feed.data&&!items.length&&<p className="empty">没有符合条件的内容</p>}
   {pagination('bottom')}
  </section>
  {current&&!editing&&<Modal title={`${current.name||'媒体'} · ${current.kind==='highlight'?'高光':'录像'}`} onClose={()=>setSelected(null)}>
   <div className="library-player-controls"><button disabled={index<=0||busy} onClick={()=>setSelected(queue[index-1])}>上一条</button><span>本组 {index+1} / {queue.length}</span><button disabled={index>=queue.length-1||busy} onClick={()=>setSelected(queue[index+1])}>下一条</button><button aria-pressed={current.favorite} disabled={busy} onClick={()=>mark([current],{favorite:!current.favorite})}>{current.favorite?'♥ 已收藏':'♡ 收藏'}</button><button disabled={busy} onClick={()=>mark([current],{watched:!current.watched})}>{current.watched?'已看 · 标为未看':'标记已看'}</button><button disabled={active(current)||current.favorite||busy} onClick={()=>setDeleting([current])}>删除当前</button><button disabled={busy} onClick={()=>setEditing(true)}>查看与整理</button>{playable(current)&&<a href={fileUrl(current)+'?download=1'} download>下载原视频</a>}</div>
   <p>{current.title||current.filename} · {when(current.started_at||current.created_at)} · {hours(current.duration_seconds)} · {size(current.bytes)}</p>
   {playable(current)?<MediaVideo key={key(current)} videoRef={player} autoPlay src={fileUrl(current)} onError={()=>setError('视频暂不可播放，请检查归档文件。')}/>:<p className="empty">{current.status} · 暂无可播放视频</p>}
   {(error||notice)&&<p role={error?'alert':'status'}>{error||notice}</p>}
  </Modal>}
  {current&&editing&&<Editor key={key(current)} item={current} onClose={()=>setEditing(false)} onSaved={saved=>{if(saved)setOverrides(o=>({...o,[key(current)]:{...o[key(current)],...saved}}));feed.reload();}}/>}
  {deleting&&<DeleteSelection items={deleting} onClose={()=>setDeleting(null)} onDone={finishDelete}/>}
 </div>;
}
