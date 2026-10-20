import {useEffect,useRef,useState} from 'react';
import {readRoute} from './navigation.js';
// Filter edits replace the current entry; navigating away retains the complete view.
export default function useRouteValues(defaults){
 const read=()=>{const {params}=readRoute();return Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,params.has(key)?(typeof value==='number'?Math.max(0,Number(params.get(key))||0):params.get(key)):value]));};
 const [values,setValues]=useState(read);
 const current=useRef(values);
 useEffect(()=>{const sync=()=>{current.current=read();setValues(current.current);};window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync);},[]);
 const update=next=>{
  const value=typeof next==='function'?next(current.current):next;
  const route=readRoute();
  for(const key of Object.keys(defaults)){if(value[key]===defaults[key]||value[key]==null)route.params.delete(key);else route.params.set(key,String(value[key]));}
  const query=route.params.toString();
  history.replaceState(history.state,'','#'+route.parts.join('/')+(query?'?'+query:''));
  current.current=value;
  setValues(value);
 };
 return [values,update];
}
