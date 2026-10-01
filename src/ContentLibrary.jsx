import React,{useEffect,useRef,useState} from 'react';
import {Modal,MediaVideo} from './MediaDialog';
import LibraryBrowser from './LibraryBrowser';
import {insightApi,useInsight,when,fileUrl,hours} from './insight-api.js';
export function ContentEditor({item,onClose,onSaved,seek=0}){
 const live=useInsight(`/content/${item.kind}/${item.id}`,5000);
 const media={...item,...live.data};
 const video=useRef(),stopAt=useRef(null),[draft,setDraft]=useState(()=>({...item})),[tags,setTags]=useState(item.tags.join('、')),[error,setError]=useState(''),[feedback,setFeedback]=useState(''),[busy,setBusy]=useState(false),[markLabel,setMarkLabel]=useState(''),[start,setStart]=useState(0),[end,setEnd]=useState('');
 const playable=['已完成','已中断'].includes(media.status)&&Number(media.bytes)>0;
 useEffect(()=>{stopAt.current=null;if(video.current?.readyState)video.current.currentTime=seek;},[seek]);
 const set=(key,value)=>{setDraft(d=>({...d,[key]:value}));setFeedback('');};
 async function save(){setBusy(true);setError('');try{const data=await insightApi(`/content/${item.kind}/${item.id}`,{title:draft.title,note:draft.note,favorite:draft.favorite,watched:draft.watched,tags:tags.split(/[、,，]/).map(t=>t.trim()).filter(Boolean),marks:draft.marks},'PUT');setDraft(d=>({...d,...data}));setFeedback('已保存');onSaved?.(data);}catch(e){setError(e.message);}finally{setBusy(false);}}
 function addMark(){const a=Number(start),b=end===''?null:Number(end);if(!Number.isFinite(a)||a<0||a>=media.duration_seconds||b!=null&&(!Number.isFinite(b)||b<=a||b>media.duration_seconds)){setError('请输入视频内的起止秒数，结束时间须晚于开始');return;}set('marks',[...draft.marks,{start:a,end:b,label:markLabel||'时间标记'}]);setMarkLabel('');setEnd('');setError('');}
 return <Modal title={`${item.name||'媒体'} · ${item.kind==='highlight'?'高光':'录像'}`} onClose={onClose}><section className="md-section content-editor"><div className="md-section-title"><h2>{item.name||'媒体'} · {item.kind==='highlight'?'高光':'录像'}</h2><button onClick={onClose}>关闭内容</button></div><p>{when(media.started_at||media.created_at)} · {media.status} · {hours(media.duration_seconds)}</p>
 {playable?<MediaVideo videoRef={video} src={fileUrl(item)} onLoadedMetadata={()=>{video.current.currentTime=Math.min(seek,Math.max(0,video.current.duration-.1));}} onTimeUpdate={()=>{if(stopAt.current!=null&&video.current.currentTime>=stopAt.current){video.current.pause();stopAt.current=null;}}} onError={()=>setError('媒体暂不可播放，请检查归档文件。')}/>:<p className="empty">{media.status} · 归档完成后可播放和标记</p>}
 <div className="insight-form"><label>标题<input aria-label="内容标题" maxLength={120} value={draft.title} onChange={e=>set('title',e.target.value)} placeholder={item.filename}/></label><label>标签<input aria-label="内容标签" value={tags} onChange={e=>setTags(e.target.value)} placeholder="用逗号或顿号分隔"/></label><label className="full">备注<textarea aria-label="内容备注" maxLength={2000} value={draft.note} onChange={e=>set('note',e.target.value)}/></label></div>
 <div className="insight-filters"><label><input type="checkbox" checked={draft.favorite} onChange={e=>set('favorite',e.target.checked)}/>收藏</label><label><input type="checkbox" checked={draft.watched} onChange={e=>set('watched',e.target.checked)}/>已看过</label>{playable&&<a href={fileUrl(item)+'?download=1'}>下载原视频</a>}</div>
 <h3>时间标记与片段</h3><p className="muted">记录起止时间即可回看片段；不会修改原视频。编辑后点击保存。</p>
 {playable&&<><div className="insight-actions"><button onClick={()=>{setStart(Number((video.current?.currentTime||0).toFixed(1)));setEnd('');}}>标记当前时间</button><button onClick={()=>setEnd(Number((video.current?.currentTime||0).toFixed(1)))}>取当前时间为结束</button></div><div className="insight-form"><label>标记说明<input aria-label="标记说明" maxLength={120} value={markLabel} onChange={e=>setMarkLabel(e.target.value)}/></label><label>起点（秒）<input aria-label="标记起点" type="number" min="0" step="0.1" value={start} onChange={e=>setStart(e.target.value)}/></label><label>终点（秒，可留空）<input aria-label="标记终点" type="number" min="0" step="0.1" value={end} onChange={e=>setEnd(e.target.value)}/></label><button onClick={addMark}>添加标记</button></div></>}
 <div className="insight-marks">{draft.marks.map((m,i)=><div key={i}><button disabled={!playable} onClick={()=>{video.current.currentTime=m.start;stopAt.current=m.end;video.current.play().catch(()=>{});}}>{m.label} · {m.start}s{m.end!=null?` — ${m.end}s`:''}</button><button aria-label={'移除标记 '+m.label} onClick={()=>set('marks',draft.marks.filter((_,n)=>i!==n))}>移除</button></div>)}</div>
 {error&&<p role="alert">{error}</p>}{feedback&&<p role="status">{feedback}</p>}<button className="primary" disabled={busy} onClick={save}>{busy?'保存中…':'保存内容信息'}</button></section></Modal>;
}
export default function ContentLibrary(props){
 return <LibraryBrowser {...props} Editor={ContentEditor}/>;
}
