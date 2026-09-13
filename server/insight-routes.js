import express from 'express';
import {pool} from './db.js';
import {comparePeriods,validateMetadata} from './insight-logic.js';
export const insightRoutes=express.Router();
const validId=v=>/^\d{1,19}$/.test(String(v))&&BigInt(v)>0n&&BigInt(v)<=9223372036854775807n;
const validModel=v=>validId(v)&&BigInt(v)<=2147483647n;
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const mediaSql=`SELECT 'recording' AS kind,id,model_id,filename,status,duration_seconds,bytes,started_at,finished_at,created_at,'[]'::jsonb AS reasons FROM recordings
 UNION ALL SELECT 'highlight',id,model_id,filename,status,duration_seconds,bytes,started_at,finished_at,triggered_at,reasons FROM highlights`;
const metadataSql=`coalesce(md.title,'') AS title,coalesce(md.tags,'[]'::jsonb) AS tags,coalesce(md.favorite,false) AS favorite,coalesce(md.watched,false) AS watched,coalesce(md.note,'') AS note,coalesce(md.marks,'[]'::jsonb) AS marks`;
insightRoutes.get('/content',async(req,res)=>{
 const q=String(req.query.q||'').slice(0,200),model=req.query.model||null,kind=req.query.kind||'',offset=Number(req.query.offset||0),date=req.query.date||null,session=req.query.session||null;
 if(model&&!validModel(model)||session&&!validId(session)||!['','recording','highlight'].includes(kind)||!Number.isSafeInteger(offset)||offset<0||offset>100000||date&&!validDate(date))return res.status(400).json({error:'无效内容筛选'});
 const {rows}=await pool.query(`WITH media AS (${mediaSql}) SELECT c.*,m.name,${metadataSql} FROM media c LEFT JOIN models m ON m.id=c.model_id LEFT JOIN content_metadata md ON md.kind=c.kind AND md.item_id=c.id
 WHERE ($1::bigint IS NULL OR c.model_id=$1) AND ($2='' OR c.kind=$2) AND ($3='' OR concat_ws(' ',c.filename,m.name,md.title,md.tags::text,md.note,c.reasons::text) ILIKE '%'||$3||'%')
 AND (NOT $4 OR md.favorite) AND (NOT $5 OR NOT coalesce(md.watched,false))
 AND ($6::date IS NULL OR (coalesce(c.started_at,c.created_at) AT TIME ZONE 'Asia/Hong_Kong')::date=$6)
 AND ($7::bigint IS NULL OR EXISTS(SELECT 1 FROM broadcast_sessions s WHERE s.id=$7 AND s.model_id=c.model_id AND c.started_at<=coalesce(s.ended_at,s.last_seen) AND coalesce(c.finished_at,now())>=s.first_seen))
 ORDER BY c.created_at DESC,c.kind,c.id DESC LIMIT 25 OFFSET $8`,[model,kind,q,req.query.favorite==='true',req.query.unwatched==='true',date,session,offset]);
 res.json({items:rows.slice(0,24),nextOffset:rows.length>24?offset+24:null});
});
insightRoutes.get('/content/:kind/:id',async(req,res)=>{
 if(!['recording','highlight'].includes(req.params.kind)||!validId(req.params.id))return res.status(400).json({error:'无效内容 ID'});
 const {rows}=await pool.query(`WITH media AS (${mediaSql}) SELECT c.*,m.name,${metadataSql} FROM media c LEFT JOIN models m ON m.id=c.model_id LEFT JOIN content_metadata md ON md.kind=c.kind AND md.item_id=c.id WHERE c.kind=$1 AND c.id=$2`,[req.params.kind,req.params.id]);
 if(!rows.length)return res.status(404).json({error:'内容不存在'});res.json(rows[0]);
});
insightRoutes.put('/content/:kind/:id',async(req,res)=>{
 const {kind,id}=req.params;if(!['recording','highlight'].includes(kind)||!validId(id))return res.status(400).json({error:'无效内容 ID'});
 const {rows}=await pool.query(`SELECT duration_seconds FROM ${kind==='recording'?'recordings':'highlights'} WHERE id=$1::bigint`,[id]);if(!rows.length)return res.status(404).json({error:'内容不存在'});
 let v;try{v=validateMetadata(req.body,Number(rows[0].duration_seconds));}catch(e){return res.status(400).json({error:e.message});}
 await pool.query(`INSERT INTO content_metadata(kind,item_id,title,tags,favorite,watched,note,marks) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(kind,item_id) DO UPDATE SET title=$3,tags=$4,favorite=$5,watched=$6,note=$7,marks=$8,updated_at=now()`,[kind,id,v.title,JSON.stringify(v.tags),v.favorite,v.watched,v.note,JSON.stringify(v.marks)]);
 res.json(v);
});
insightRoutes.get('/models/:id/sessions/:session',async(req,res)=>{
 const {id,session}=req.params;if(!validModel(id)||!validId(session))return res.status(400).json({error:'无效场次 ID'});
 const s=(await pool.query('SELECT * FROM broadcast_sessions WHERE id=$1 AND model_id=$2',[session,id])).rows[0];if(!s)return res.status(404).json({error:'场次不存在'});
 const end=s.ended_at||s.last_seen;
 const [points,events,goals,media,tips,coverage]=await Promise.all([
 pool.query(`SELECT min(observed_at) AS time,avg(viewers) FILTER(WHERE online AND error IS NULL)::float AS viewers,bool_or(error IS NOT NULL OR online IS NULL) AS gap FROM broadcast_observations WHERE model_id=$1 AND observed_at BETWEEN $2 AND $3 GROUP BY date_trunc('minute',observed_at) ORDER BY 1`,[id,s.first_seen,end]),
 pool.query('SELECT * FROM events WHERE model_id=$1 AND created_at BETWEEN $2 AND $3 ORDER BY created_at',[id,s.first_seen,end]),
 pool.query('SELECT * FROM goal_signals WHERE model_id=$1 AND observed_at BETWEEN $2 AND $3 ORDER BY observed_at',[id,s.first_seen,end]),
 pool.query(`WITH media AS (${mediaSql}) SELECT c.*,${metadataSql} FROM media c LEFT JOIN content_metadata md ON md.kind=c.kind AND md.item_id=c.id WHERE model_id=$1 AND coalesce(started_at,created_at)<=$3 AND coalesce(finished_at,now())>=$2 ORDER BY started_at`,[id,s.first_seen,end]),
 pool.query(`SELECT min(message_at) AS time,sum(amount)::float AS tokens,count(*)::int AS tips FROM chat_events WHERE model_id=$1 AND kind='tip' AND source='live' AND message_at BETWEEN $2 AND $3 GROUP BY date_trunc('minute',message_at) ORDER BY 1`,[id,s.first_seen,end]),
 pool.query(`WITH ordered AS (SELECT *,lag(ended_at) OVER(ORDER BY started_at) AS previous_end FROM broadcast_intervals WHERE session_id=$1),groups AS (SELECT *,sum(CASE WHEN started_at=previous_end THEN 0 ELSE 1 END) OVER(ORDER BY started_at) AS group_id FROM ordered) SELECT min(started_at) AS started_at,max(ended_at) AS ended_at FROM groups GROUP BY group_id ORDER BY 1`,[session])]);
 res.json({session:s,points:points.rows,events:events.rows,goals:goals.rows,media:media.rows,tips:tips.rows,coverage:coverage.rows});
});
insightRoutes.get('/notifications',async(req,res)=>{
 const before=req.query.before||'9223372036854775807',kind=req.query.kind||'',unread=req.query.unread==='true';
 if(!validId(before)||!['','online','offline','highlight','goalComplete','goalNear','profile','rule'].includes(kind))return res.status(400).json({error:'无效通知筛选'});
 const [items,counts]=await Promise.all([
 pool.query(`SELECT e.*,m.name,(SELECT id FROM broadcast_sessions s WHERE s.model_id=e.model_id AND e.created_at BETWEEN s.first_seen AND coalesce(s.ended_at,s.last_seen) ORDER BY s.first_seen DESC LIMIT 1) AS linked_session FROM events e LEFT JOIN models m ON m.id=e.model_id WHERE e.id<$1::bigint AND ($2='' OR e.kind=$2) AND (NOT $3 OR e.read_at IS NULL) ORDER BY e.id DESC LIMIT 51`,[before,kind,unread]),
 pool.query('SELECT count(*)::int AS total,count(*) FILTER(WHERE read_at IS NULL)::int AS unread,max(id) AS latest FROM events')]);
 res.json({...counts.rows[0],items:items.rows.slice(0,50),nextBefore:items.rows.length>50?items.rows[49].id:null});
});
insightRoutes.post('/notifications/read',async(req,res)=>{
 const {id,through}=req.body||{};if(!validId(id||through)||id&&through)return res.status(400).json({error:'无效通知 ID'});
 await pool.query(`UPDATE events SET read_at=coalesce(read_at,now()) WHERE id${id?'=':'<='}$1::bigint`,[id||through]);res.json({ok:true});
});
insightRoutes.get('/models/:id/profile-history',async(req,res)=>{
 const before=req.query.before||'9223372036854775807';if(!validModel(req.params.id)||!validId(before))return res.status(400).json({error:'无效查询'});
 const [items,status]=await Promise.all([pool.query('SELECT * FROM profile_snapshots WHERE model_id=$1 AND id<$2 ORDER BY id DESC LIMIT 21',[req.params.id,before]),pool.query('SELECT * FROM profile_monitor_state WHERE model_id=$1',[req.params.id])]);
 res.json({items:items.rows.slice(0,20),nextBefore:items.rows.length>20?items.rows[19].id:null,status:status.rows[0]||null});
});
insightRoutes.get('/models/:id/comparison',async(req,res)=>{
 if(!validModel(req.params.id))return res.status(400).json({error:'无效主播 ID'});
 // Two completed seven-day periods, clipped to UTC+8 midnight. Each metric uses its own observed denominator.
 const {rows}=await pool.query(`WITH periods AS (SELECT p AS period,((now() AT TIME ZONE 'Asia/Hong_Kong')::date-(7*(p+1))) AT TIME ZONE 'Asia/Hong_Kong' AS lo,((now() AT TIME ZONE 'Asia/Hong_Kong')::date-(7*p)) AT TIME ZONE 'Asia/Hong_Kong' AS hi FROM generate_series(0,1) p)
 SELECT p.period,coalesce(v.seconds,0)::float AS seconds,coalesce(v.viewer_seconds,0)::float AS viewer_seconds,v.average::float,coalesce(v.days,0)::int AS days,
 coalesce(c.seconds,0)::float AS chat_seconds,coalesce(t.messages,0)::int AS messages,coalesce(t.tokens,0)::float AS tokens,p.lo,p.hi,starts.hour AS start_hour,coalesce(starts.count,0)::int AS start_count
 FROM periods p LEFT JOIN LATERAL (SELECT sum(extract(epoch from least(i.ended_at,p.hi)-greatest(i.started_at,p.lo))) AS seconds,
 sum(extract(epoch from least(i.ended_at,p.hi)-greatest(i.started_at,p.lo))) FILTER(WHERE viewer_average IS NOT NULL) AS viewer_seconds,
 sum(viewer_average*extract(epoch from least(i.ended_at,p.hi)-greatest(i.started_at,p.lo)))/nullif(sum(extract(epoch from least(i.ended_at,p.hi)-greatest(i.started_at,p.lo))) FILTER(WHERE viewer_average IS NOT NULL),0) AS average,
 count(DISTINCT (greatest(i.started_at,p.lo) AT TIME ZONE 'Asia/Hong_Kong')::date) AS days FROM broadcast_intervals i WHERE model_id=$1 AND i.started_at<p.hi AND i.ended_at>p.lo) v ON true
 LEFT JOIN LATERAL (SELECT sum(extract(epoch from least(coalesce(ended_at,last_seen),p.hi)-greatest(started_at,p.lo))) AS seconds FROM chat_coverage WHERE model_id=$1 AND started_at<p.hi AND coalesce(ended_at,last_seen)>p.lo) c ON true
 LEFT JOIN LATERAL (SELECT count(*) FILTER(WHERE kind='text') AS messages,sum(amount) FILTER(WHERE kind='tip') AS tokens FROM chat_events e WHERE model_id=$1 AND source='live' AND message_at>=p.lo AND message_at<p.hi AND EXISTS(SELECT 1 FROM chat_coverage cc WHERE cc.model_id=e.model_id AND e.message_at BETWEEN cc.started_at AND coalesce(cc.ended_at,cc.last_seen))) t ON true LEFT JOIN LATERAL (SELECT extract(hour from first_seen AT TIME ZONE 'Asia/Hong_Kong')::int AS hour,count(*)::int AS count FROM broadcast_sessions WHERE model_id=$1 AND start_known AND first_seen>=p.lo AND first_seen<p.hi GROUP BY 1 ORDER BY count(*) DESC,1 LIMIT 1) starts ON true ORDER BY p.period`,[req.params.id]);
 res.json(comparePeriods(rows));
});
