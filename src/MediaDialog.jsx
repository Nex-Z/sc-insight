import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {insightApi} from './insight-api.js';

let openModals=0,originalOverflow='';

export function Modal({title,onClose,busy=false,alert=false,children,className=''}){
 const ref=useRef(),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  const previous=document.activeElement;ref.current.showModal();
  if(openModals===0)originalOverflow=document.body.style.overflow;
  openModals++;document.body.style.overflow='hidden';
  return()=>{openModals--;if(openModals===0)document.body.style.overflow=originalOverflow;if(previous?.isConnected)previous.focus?.({preventScroll:true});};
 },[]);
 return createPortal(<dialog ref={ref} className={`media-dialog ${className}`} aria-label={title} role={alert?'alertdialog':'dialog'} aria-modal="true" onCancel={e=>{e.preventDefault();if(!busy)close.current();}} onClick={e=>{if(e.target===e.currentTarget&&!busy)close.current();}}><div className="media-dialog-body"><div className="media-dialog-heading"><h2>{title}</h2><button autoFocus disabled={busy} aria-label={alert?'取消删除':'关闭播放'} onClick={onClose}>关闭</button></div>{children}</div></dialog>,document.body);
}

export function MediaVideo({videoRef,...props}){
 const own=useRef(),ref=videoRef||own,[error,setError]=useState('');
 async function fullscreen(){try{const v=ref.current;if(v.requestFullscreen)await v.requestFullscreen();else if(v.webkitEnterFullscreen)v.webkitEnterFullscreen();else throw Error();}catch{setError('当前浏览器无法进入全屏，可使用视频自带的全屏按钮。');}}
 return <div className="media-video"><video ref={ref} controls playsInline preload="metadata" {...props}/><button className="media-fullscreen" onClick={fullscreen}>全屏播放</button>{error&&<p role="alert">{error}</p>}</div>;
}

export function DeleteMediaDialog({item,onClose,onDeleted}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const kind=item.kind==='highlight'?'高光':'录像';
 async function remove(){setBusy(true);setError('');try{const result=await insightApi(`/content/${item.kind}/${item.id}`,{confirm:true},'DELETE');onDeleted(result);}catch(e){setError(e.message);setBusy(false);}}
 return <Modal title={`确认删除${kind}`} onClose={onClose} busy={busy} alert className="delete-media-dialog"><p><strong>{item.title||item.name||item.filename||kind}</strong> · #{item.id}</p><p>{item.triggered_at||item.created_at?new Date(item.triggered_at||item.created_at).toLocaleString('zh-CN'):''}</p><p>将永久删除这一条{kind}的视频文件，以及标题、标签、备注和时间标记，无法撤销。其他录像和主播监控设置不受影响。</p><p>此操作不会清理独立的录制缓存，也不会关闭自动录制。</p>{error&&<p role="alert">{error}</p>}<div className="insight-actions"><button disabled={busy} onClick={onClose}>取消</button><button className="primary" disabled={busy} onClick={remove}>{busy?'删除中…':'确认永久删除'}</button></div></Modal>;
}
