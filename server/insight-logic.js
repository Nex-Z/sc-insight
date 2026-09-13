const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function profileSnapshot(previous,profile){
 const unavailable=new Set(profile.unavailable||[]),data={...previous};
 const groups={profile:['name','bio','statusText'],menu:['menu'],albums:['albums']};
 for(const [group,fields] of Object.entries(groups))if(!unavailable.has(group))for(const key of fields){
  if(profile[key]==null&&['menu','albums'].includes(key))continue;
  if(key==='albums')data.albums=profile.albums.items.map(a=>({id:a.id,name:a.name,count:a.count,photos:a.photos.map(p=>({id:p.id,url:p.url,fullUrl:p.fullUrl}))}));
  else data[key]=profile[key];
 }
 for(const key of ['followers','rating','ratingCount'])if(profile[key]!=null)data[key]=profile[key];
 const changes=[];
 const labels={name:'公开名称',bio:'简介',statusText:'状态文案',menu:'小费菜单'};
 for(const [key,label] of Object.entries(labels))if(previous&&key in previous&&key in data&&!same(previous[key],data[key]))changes.push({field:key,label,before:previous[key],after:data[key]});
 if(previous?.albums&&data.albums){
  const old=new Set(previous.albums.flatMap(a=>a.photos.map(p=>p.id)));
  const photos=data.albums.flatMap(a=>a.photos).filter(p=>!old.has(p.id));
  if(photos.length)changes.push({field:'photos',label:'新增可见公开照片',photos});
  const oldCounts=previous.albums.map(a=>[a.id,a.name,a.count]).sort(),newCounts=data.albums.map(a=>[a.id,a.name,a.count]).sort();
  if(!same(oldCounts,newCounts))changes.push({field:'albums',label:'公开相册目录变化',before:oldCounts,after:newCounts});
 }
 return {data,changes};
}
export function validateMetadata(value,duration){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('无效内容信息');
 if(typeof value.title!=='string'||value.title.length>120||typeof value.note!=='string'||value.note.length>2000||typeof value.favorite!=='boolean'||typeof value.watched!=='boolean')throw Error('标题、备注或状态无效');
 if(!Array.isArray(value.tags)||value.tags.length>20||value.tags.some(t=>typeof t!=='string'||!t.trim()||t.length>30))throw Error('最多 20 个标签，每个 30 字');
 if(!Array.isArray(value.marks)||value.marks.length>100)throw Error('最多保存 100 个标记');
 const marks=value.marks.map(m=>{
  if(!m||typeof m.label!=='string'||m.label.length>120||!Number.isFinite(m.start)||m.start<0||m.start>=duration||m.end!=null&&(!Number.isFinite(m.end)||m.end<=m.start||m.end>duration))throw Error('标记时间须在视频内，片段结束须晚于开始');
  return {label:m.label,start:m.start,end:m.end??null};
 });
 return {title:value.title.trim(),note:value.note,tags:[...new Set(value.tags.map(t=>t.trim()))],favorite:value.favorite,watched:value.watched,marks};
}
export function comparePeriods(rows){
 const periods=[0,1].map(period=>rows.find(r=>r.period===period)||{period,seconds:0,viewer_seconds:0,average:null,chat_seconds:0,messages:0,tokens:0,days:0});
 const [current,previous]=periods;
 const comparable=periods.every(p=>p.viewer_seconds>=3600&&p.days>=3);
 const chatComparable=periods.every(p=>p.chat_seconds>=3600);
 return {current,previous,comparable,chatComparable,viewerChange:comparable&&Number(previous.average)>0?(current.average/previous.average-1)*100:null,
  messageRates:periods.map(p=>p.chat_seconds>0?p.messages/p.chat_seconds*3600:null),tokenRates:periods.map(p=>p.chat_seconds>0?p.tokens/p.chat_seconds*3600:null)};
}
