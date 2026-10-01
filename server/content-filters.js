const dateOK=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function contentFilters(query){
 const {from='',to='',duration='',status='',view='',sort='newest'}=query;
 if(from&&!dateOK(from)||to&&!dateOK(to)||from&&to&&from>to||!['','short','medium','long'].includes(duration)||!['','playable','active','failed'].includes(status)||!['','unwatched','favorite','cleanup'].includes(view)||!['newest','oldest','largest','longest'].includes(sort))throw new Error('无效内容筛选');
 const conditions=[],values=[];
 const bind=v=>{values.push(v);return '$'+(8+values.length);};
 if(from)conditions.push(`(coalesce(c.started_at,c.created_at) AT TIME ZONE 'Asia/Hong_Kong')::date>=${bind(from)}::date`);
 if(to)conditions.push(`(coalesce(c.started_at,c.created_at) AT TIME ZONE 'Asia/Hong_Kong')::date<=${bind(to)}::date`);
 if(duration==='short')conditions.push('c.duration_seconds>0 AND c.duration_seconds<60');
 if(duration==='medium')conditions.push('c.duration_seconds>=60 AND c.duration_seconds<600');
 if(duration==='long')conditions.push('c.duration_seconds>=600');
 if(status==='playable')conditions.push("c.status IN ('已完成','已中断') AND c.bytes>0");
 if(status==='active')conditions.push("c.status IN ('排队中','连接中','录制中','归档中')");
 if(status==='failed')conditions.push("c.status='失败'");
 if(view==='unwatched')conditions.push('NOT coalesce(md.watched,false)');
 if(view==='favorite')conditions.push('coalesce(md.favorite,false)');
 if(view==='cleanup')conditions.push("coalesce(md.watched,false) AND NOT coalesce(md.favorite,false) AND c.status NOT IN ('排队中','连接中','录制中','归档中')");
 const order={newest:'c.created_at DESC',oldest:'c.created_at ASC',largest:'c.bytes DESC NULLS LAST',longest:'c.duration_seconds DESC NULLS LAST'}[sort];
 return {sql:conditions.length?' AND '+conditions.map(c=>'('+c+')').join(' AND '):'',values,order:order+',c.kind,c.id DESC'};
}
