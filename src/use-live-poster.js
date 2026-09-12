import {useEffect,useState} from 'react';
import {snapshot} from './model-snapshot.js';
export function useLivePoster(model){
 const [frame,setFrame]=useState(null);
 useEffect(()=>{let stopped=false,image;setFrame(null);
 void snapshot(model.id).then(url=>{if(stopped||!url)return;image=new Image();image.referrerPolicy='no-referrer';image.onload=()=>{if(!stopped)setFrame({id:model.id,url});};image.src=url;});
 return()=>{stopped=true;if(image){image.onload=null;image.onerror=null;}};
 },[model.id]);
 return (frame?.id===model.id?frame.url:null)||model.cover_url||model.avatar_url||undefined;
}
