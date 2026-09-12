import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const target=process.argv[2];if(!target)throw new Error('请提供测试主播名称');
const base=process.env.TEST_API_URL||'http://127.0.0.1:3010/api';
const active=r=>['排队中','连接中','录制中','归档中'].includes(r.status);
async function api(path,body,method='POST'){
 const response=await fetch(base+path,body===undefined?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw new Error(data.error);return data;
}
const before=await api('/state'),model=before.models.find(m=>m.name.toLowerCase()===target.toLowerCase());
if(!model||model.auto_record||before.recordings.some(r=>r.model_id===model.id&&active(r)))throw new Error('测试需要已收录且未自动录制的主播');
const baseline=Math.max(0,...before.recordings.map(r=>r.id));
let enabled=false;
const own=s=>s.recordings.filter(r=>r.model_id===model.id&&r.id>baseline);
async function waitFor(check){
 const deadline=Date.now()+90000;
 while(Date.now()<deadline){const rows=own(await api('/state'));const bad=rows.find(r=>r.status==='失败'||r.status==='已中断');if(bad)throw new Error(bad.error);const result=check(rows);if(result)return result;await new Promise(r=>setTimeout(r,1000));}
 throw new Error('录制验证超时');
}
try{
 await api('/recordings/by-target',{target,max_seconds:5,auto_record:true,until_offline:true});enabled=true;
 const running=await waitFor(rows=>rows.find(r=>r.status==='录制中'&&r.duration_seconds>10));
 assert.equal(running.until_offline,true);assert.equal(own(await api('/state')).length,1);
 await api('/recordings/'+running.id+'/stop',{});
 const done=await waitFor(rows=>rows.find(r=>r.id===running.id&&r.status==='已完成'));
 assert.ok(done.duration_seconds>10);assert.ok(done.bytes>100);
 assert.equal((await api('/state')).models.find(m=>m.id===model.id).auto_record,false);
 const report={ok:true,id:done.id,configuredSegmentSeconds:5,recordedSeconds:done.duration_seconds,filename:done.filename,directory:done.directory};
 await fs.writeFile('artifacts/continuous-recording-verification.json',JSON.stringify(report,null,2));console.log(report);
}finally{
 if(enabled){await api('/recording-sources/'+model.id,{auto_record:false},'PATCH');for(const row of own(await api('/state')).filter(active))await api('/recordings/'+row.id+'/stop',{}).catch(()=>{});}
}
