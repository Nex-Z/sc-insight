import React,{useState} from 'react';
export default function ModelCover({model}){
 const [failed,setFailed]=useState([]);
 const url=[model.cover_url,model.avatar_url].find(value=>value&&!failed.includes(value));
 return url?<img className="model-cover-image" src={url} alt={`${model.name} 封面`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(values=>[...values,url])}/>:null;
}
