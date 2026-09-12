import express from 'express';
import {pool} from './db.js';
import {activitySummary} from './activity.js';
export const broadcastRoutes=express.Router();
const activityCache=new Map();
broadcastRoutes.get('/models/:id/activity',async(req,res)=>{
 const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'无效主播 ID'});
 const cached=activityCache.get(id);if(cached&&Date.now()-cached.time<60000)return res.json(cached.data);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const since=new Date(Date.parse(today+'T00:00:00+08:00')-364*86400000).toISOString();
 const [hours,observations,starts]=await Promise.all([
 pool.query(`SELECT to_char(h AT TIME ZONE 'Asia/Hong_Kong','YYYY-MM-DD') AS day,extract(hour from h AT TIME ZONE 'Asia/Hong_Kong')::int AS hour,
 sum(extract(epoch from least(i.ended_at,h+interval '1 hour')-greatest(i.started_at,h,$2::timestamptz)))::float AS seconds
 FROM broadcast_intervals i CROSS JOIN LATERAL generate_series(date_trunc('hour',greatest(i.started_at,$2::timestamptz)),i.ended_at-interval '1 microsecond',interval '1 hour') h
 WHERE i.model_id=$1 AND i.ended_at>$2 GROUP BY day,hour`,[id,since]),
 pool.query(`SELECT to_char(observed_at AT TIME ZONE 'Asia/Hong_Kong','YYYY-MM-DD') AS day,extract(hour from observed_at AT TIME ZONE 'Asia/Hong_Kong')::int AS hour,count(*)::int AS samples FROM broadcast_observations WHERE model_id=$1 AND observed_at>=$2 AND error IS NULL GROUP BY day,hour`,[id,since]),
 pool.query(`SELECT to_char(first_seen AT TIME ZONE 'Asia/Hong_Kong','YYYY-MM-DD') AS day,extract(hour from first_seen AT TIME ZONE 'Asia/Hong_Kong')::int AS hour,count(*) FILTER(WHERE start_known)::int AS starts,count(*) FILTER(WHERE NOT start_known)::int AS partial FROM broadcast_sessions WHERE model_id=$1 AND first_seen>=$2 GROUP BY day,hour`,[id,since])]);
 const data=activitySummary(hours.rows,observations.rows,starts.rows,today);
 if(activityCache.size>=100)activityCache.delete(activityCache.keys().next().value);
 activityCache.set(id,{time:Date.now(),data});res.json(data);
});
broadcastRoutes.get('/models/:id/observations',async(req,res)=>{
 const id=Number(req.params.id),before=req.query.before||'9223372036854775807';
 if(!Number.isSafeInteger(id)||id<1||!/^\d{1,19}$/.test(before)||BigInt(before)>9223372036854775807n)return res.status(400).json({error:'无效分页参数'});
 const {rows}=await pool.query('SELECT * FROM broadcast_observations WHERE model_id=$1 AND id<$2 ORDER BY id DESC LIMIT 1000',[id,before]);
 res.json({observations:rows,nextBefore:rows.length===1000?rows.at(-1).id:null});
});
broadcastRoutes.get('/models/:id/broadcasts',async(req,res)=>{
 const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'无效主播 ID'});
 const days=Number(req.query.days||30);if(![7,30,90].includes(days))return res.status(400).json({error:'支持 7、30、90 天'});
 const [sessions,daily,quality,changes]=await Promise.all([
 pool.query(`SELECT s.*,EXISTS(SELECT 1 FROM chat_coverage cc WHERE cc.model_id=s.model_id AND cc.started_at<=s.last_seen AND coalesce(cc.ended_at,cc.last_seen)>=s.first_seen) AS chat_observed,viewer_sum/nullif(samples,0) AS average_viewers,
 (SELECT count(*)::int FROM chat_events c WHERE c.session_id=s.id AND kind='text') AS messages,
 (SELECT count(DISTINCT user_id)::int FROM chat_events c WHERE c.session_id=s.id AND kind='text') AS speakers,
 (SELECT coalesce(sum(amount),0)::float FROM chat_events c WHERE c.session_id=s.id AND kind='tip') AS tokens,
 (SELECT count(*)::int FROM chat_events c WHERE c.session_id=s.id AND kind='tip') AS tips
 FROM broadcast_sessions s WHERE model_id=$1 ORDER BY first_seen DESC LIMIT 100`,[id]),
 pool.query(`WITH days AS (SELECT generate_series((now() AT TIME ZONE 'Asia/Hong_Kong')::date-($2::int-1),(now() AT TIME ZONE 'Asia/Hong_Kong')::date,interval '1 day') AS day)
 SELECT to_char(day,'YYYY-MM-DD') AS day,coalesce(sum(CASE WHEN i.id IS NOT NULL THEN extract(epoch from least(i.ended_at,(day+interval '1 day') AT TIME ZONE 'Asia/Hong_Kong')-greatest(i.started_at,day AT TIME ZONE 'Asia/Hong_Kong')) END),0)::float AS observed_seconds,
 sum(i.viewer_average*CASE WHEN i.id IS NOT NULL THEN extract(epoch from least(i.ended_at,(day+interval '1 day') AT TIME ZONE 'Asia/Hong_Kong')-greatest(i.started_at,day AT TIME ZONE 'Asia/Hong_Kong')) END)/nullif(sum(CASE WHEN i.id IS NOT NULL THEN extract(epoch from least(i.ended_at,(day+interval '1 day') AT TIME ZONE 'Asia/Hong_Kong')-greatest(i.started_at,day AT TIME ZONE 'Asia/Hong_Kong')) END),0) AS weighted_viewers
 FROM days LEFT JOIN broadcast_intervals i ON i.model_id=$1 AND i.started_at<(day+interval '1 day') AT TIME ZONE 'Asia/Hong_Kong' AND i.ended_at>day AT TIME ZONE 'Asia/Hong_Kong' GROUP BY day ORDER BY day`,[id,days]),
 pool.query("SELECT count(*) FILTER(WHERE error IS NULL)::int AS samples,(SELECT max(viewers) FROM model_snapshots WHERE model_id=$1 AND online=true AND sampled_at>now()-make_interval(days=>$2)) AS peak_viewers,count(*) FILTER(WHERE error IS NOT NULL)::int AS failures,min(observed_at) AS first_observation,max(observed_at) FILTER(WHERE error IS NULL) AS last_success FROM broadcast_observations WHERE model_id=$1 AND observed_at>now()-make_interval(days=>$2)",[id,days]),
 pool.query(`SELECT observed_at,room_status,previous_status FROM (SELECT observed_at,room_status,lag(room_status) OVER(ORDER BY observed_at,id) AS previous_status FROM broadcast_observations WHERE model_id=$1 AND error IS NULL) transitions WHERE previous_status IS NOT NULL AND room_status IS DISTINCT FROM previous_status ORDER BY observed_at DESC LIMIT 50`,[id])
 ]);
 res.json({sessions:sessions.rows,daily:daily.rows,quality:quality.rows[0],changes:changes.rows,days,timezone:'Asia/Hong_Kong'});
});
