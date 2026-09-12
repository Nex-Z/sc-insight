import React,{useState,useEffect,useRef} from 'react';
import {snapshot,loadedSnapshot,preloadSnapshot} from './model-snapshot.js';
export default function ModelCover({model}){
 const ref=useRef(null),[visible,setVisible]=useState(false),[frame,setFrame]=useState(()=>({id:model.id,url:loadedSnapshot(model.id)})),[failed,setFailed]=useState([]);
 const live=model.online&&model.room_status==='public';
 useEffect(()=>{const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{rootMargin:'300px'});observer.observe(ref.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{let stopped=false,timer,first=true;if(!visible||!live)return;
 async function update(){const url=first&&model.snapshot_url?model.snapshot_url:await snapshot(model.id);first=false;if(stopped)return;const ready=await preloadSnapshot(model.id,url);if(!stopped){if(ready)setFrame({id:model.id,url:ready});timer=setTimeout(update,30000);}}
 void update();return()=>{stopped=true;clearTimeout(timer);};},[visible,model.id,live,model.snapshot_url]);
 const current=live?(frame.id===model.id?frame.url:loadedSnapshot(model.id)):null;
 const url=[current,model.cover_url,model.avatar_url].find(value=>value&&!failed.includes(value));
 return <span ref={ref} className="model-cover-media">{url&&<img className="model-cover-image" src={url} alt={`${model.name} ${url===current?'直播抓帧':'封面'}`} loading={visible?'eager':'lazy'} decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(values=>[...values.slice(-5),url])}/>}</span>;
}
