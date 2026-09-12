import fs from 'node:fs/promises';
const target=process.argv[2];if(!target)throw new Error('用法：node server/auto-recording-check.js 主播名称');
const base=process.env.TEST_API_URL||'http://127.0.0.1:3010/api';
async function api(path,body,method='POST'){
 const response=await fetch(base+path,body===undefined?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw new Error(data.error);return data;
}
const before=await api('/state');const model=before.models.find(m=>m.name.toLowerCase()===target.toLowerCase()||m.source_id===target);
if(model?.auto_record||before.recordings.some(r=>r.model_id===model?.id&&['排队中','连接中','录制中','归档中'].includes(r.status)))throw new Error('目标已有录制配置在运行，测试未启动');
const baseline=Math.max(0,...before.recordings.map(r=>r.id));
let first,modelId;const observed=new Set();
try{
 first=await api('/recordings/by-target',{target,max_seconds:6,auto_record:true,until_offline:false});modelId=first.model_id;
 const deadline=Date.now()+90000;let completed=[];
 while(Date.now()<deadline){
  const state=await api('/state');
  const own=state.recordings.filter(r=>r.model_id===modelId&&r.id>baseline);own.forEach(r=>observed.add(r.id));
  const failure=own.find(r=>r.status==='失败');if(failure)throw new Error(failure.error);
  completed=own.filter(r=>r.status==='已完成');if(completed.length>=2)break;
  await new Promise(r=>setTimeout(r,1500));
 }
 if(completed.length<2)throw new Error('未观察到连续两段成功录制');
 const state=await api('/state');const active=state.recordings.find(r=>r.model_id===modelId&&r.id>baseline&&['排队中','连接中','录制中'].includes(r.status));
 if(active){observed.add(active.id);await api('/recordings/'+active.id+'/stop',{});}else await api('/recording-sources/'+modelId,{auto_record:false},'PATCH');
 const final=await api('/state');if(final.models.find(m=>m.id===modelId).auto_record)throw new Error('自动录制未关闭');
 const report={ok:true,browser:false,completed:completed.map(r=>({id:r.id,seconds:r.duration_seconds,bytes:r.bytes})),autoStopped:true};
 await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/auto-recording-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{
 if(modelId)await api('/recording-sources/'+modelId,{auto_record:false},'PATCH');
 for(const id of observed)await api('/recordings/'+id+'/stop',{}).catch(()=>{});
}
