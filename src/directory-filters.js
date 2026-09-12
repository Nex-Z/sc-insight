export function filterDirectory(models,options={}){
 const {online='all',region='all',group='all',min='',max='',sort='viewers'}=options;
 const value=(m,key)=>Number.isFinite(Number(m[key]))&&m[key]!=null?Number(m[key]):null;
 return models.filter(m=>(online==='all'||(online==='unknown'?!m.fresh:m.fresh&&(online==='online'?m.online:!m.online)))&&(region==='all'||m.country===region)&&(group==='all'||(group==='favorite'?m.favorite:m.monitored))&&(min===''||(value(m,'viewers')!==null&&value(m,'viewers')>=Number(min)))&&(max===''||(value(m,'viewers')!==null&&value(m,'viewers')<=Number(max)))).sort((a,b)=>{
  if(sort==='name')return a.name.localeCompare(b.name);
  const key=sort==='growth'?'growth':'viewers',av=value(a,key),bv=value(b,key);
  return av===null?(bv===null?0:1):bv===null?-1:bv-av;
 });
}
