const signature=row=>JSON.stringify([row.online,row.room_status,row.viewers==null,row.error||null]);
const gap=(a,b)=>{const seconds=(+new Date(b.observed_at)-+new Date(a.observed_at))/1000;return seconds<0||seconds>Math.max(20,b.interval_seconds*3);};

export function groupObservations(rows){
 const groups=[];
 for(const row of rows){const last=groups.at(-1);if(!last||signature(last.at(-1))!==signature(row)||gap(last.at(-1),row))groups.push([row]);else last.push(row);}
 return groups.map(samples=>{
  const first=samples[0],last=samples.at(-1);let seconds=0,area=0;
  for(let i=1;i<samples.length;i++){const a=samples[i-1],b=samples[i],dt=(+new Date(b.observed_at)-+new Date(a.observed_at))/1000;if(a.online&&b.online){seconds+=dt;if(a.viewers!=null&&b.viewers!=null)area+=(a.viewers+b.viewers)/2*dt;}}
  const viewers=samples.filter(s=>s.viewers!=null).map(s=>s.viewers);
  return {sample:last,summary:{firstTime:first.observed_at,firstViewers:first.viewers,count:samples.length,viewerCount:viewers.length,viewerSum:viewers.reduce((a,b)=>a+b,0),peak:viewers.length?Math.max(...viewers):null,internalSeconds:seconds,internalAverage:seconds&&viewers.length===samples.length?area/seconds:null,forceGap:!!first.restart},samples};
 });
}

export class ObservationBuffer{
 constructor({checkpointMs=60000}={}){this.entries=new Map();this.checkpointMs=checkpointMs;}
 add(modelId,sample,interval,now=Date.now(),force=false){
  let entry=this.entries.get(modelId);if(!entry){entry={pending:[],recent:[],savedAt:null};this.entries.set(modelId,entry);}
  if(entry.pending.length>=120)return true;
  const row={...sample,observed_at:new Date(now).toISOString(),interval_seconds:interval,restart:!entry.last};
  const boundary=!entry.last||signature(entry.last)!==signature(row)||gap(entry.last,row);
  entry.pending.push(row);entry.recent.push(row);entry.last=row;if(!row.error)entry.lastGood=row;
  entry.recent=entry.recent.filter(r=>now-+new Date(r.observed_at)<=420000).slice(-512);
  return boundary||force||entry.savedAt===null||now-entry.savedAt>=this.checkpointMs||entry.pending.length>=120;
 }
 pending(id){return this.entries.get(id)?.pending.slice()||[];}
 committed(id,count){const e=this.entries.get(id);if(e&&count){e.savedAt=+new Date(e.pending[count-1].observed_at);e.pending.splice(0,count);}}
 recent(id,persisted=[]){const rows=new Map(persisted.map(r=>[+new Date(r.observed_at),r]));for(const r of this.entries.get(id)?.recent||[])rows.set(+new Date(r.observed_at),r);return [...rows.values()].sort((a,b)=>+new Date(a.observed_at)-+new Date(b.observed_at));}
 current(id){return this.entries.get(id)?.lastGood;}
 retain(ids){for(const id of this.entries.keys())if(!ids.has(id))this.entries.delete(id);}
}
