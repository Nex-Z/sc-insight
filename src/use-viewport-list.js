import {useLayoutEffect,useRef,useState} from 'react';
// Render one measured screen at a time; re-observe after growth to fill tall windows.
export default function useViewportList(total,resetKey){
 const grid=useRef(null),sentinel=useRef(null),batch=useRef(1);
 const [window,setWindow]=useState({key:resetKey,count:1}),[layout,setLayout]=useState(0);
 const count=window.key===resetKey?window.count:1;
 useLayoutEffect(()=>{
  const node=grid.current;if(!node)return;
  const measure=()=>{const card=node.firstElementChild;if(!card)return;const style=getComputedStyle(node),columns=style.gridTemplateColumns.split(' ').length;const height=card.getBoundingClientRect().height+parseFloat(style.rowGap||0);const next=Math.max(1,columns*Math.ceil(innerHeight/Math.max(1,height)));if(next!==batch.current){batch.current=next;setLayout(n=>n+1);}};
  measure();const observer=new ResizeObserver(measure);observer.observe(node);if(node.firstElementChild)observer.observe(node.firstElementChild);globalThis.addEventListener('resize',measure);
  return()=>{observer.disconnect();globalThis.removeEventListener('resize',measure);};
 },[resetKey,total>0]);
 useLayoutEffect(()=>{
  if(count>=total||!sentinel.current)return;
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))setWindow(w=>({key:resetKey,count:Math.min(total,(w.key===resetKey?w.count:1)+batch.current)}));},{rootMargin:`${Math.round(innerHeight/2)}px 0px`});
  observer.observe(sentinel.current);return()=>observer.disconnect();
 },[count,total,resetKey,layout]);
 return {grid,sentinel,count:Math.min(count,total)};
}
