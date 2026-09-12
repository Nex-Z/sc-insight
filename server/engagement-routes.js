import express from 'express';
import {pool} from './db.js';
import {chatMonitorState} from './chat-monitor.js';
export const engagementRoutes=express.Router();
engagementRoutes.get('/models/:id/engagement',async(req,res)=>{
 const id=Number(req.params.id),days=Number(req.query.days||30);if(!Number.isSafeInteger(id)||id<1||![7,30,90].includes(days))return res.status(400).json({error:'无效查询参数'});
 const [totals,daily,coverage,states,counts]=await Promise.all([
 pool.query(`SELECT count(*) FILTER(WHERE kind='text')::int AS messages,count(DISTINCT user_id) FILTER(WHERE kind='text')::int AS speakers,
 count(*) FILTER(WHERE kind='tip')::int AS tips,coalesce(sum(amount) FILTER(WHERE kind='tip'),0)::float AS tokens,
 count(*) FILTER(WHERE kind='tip' AND amount IS NULL)::int AS unknown_tips,count(DISTINCT user_id) FILTER(WHERE kind='tip')::int AS tippers
 FROM chat_events WHERE model_id=$1 AND message_at>now()-make_interval(days=>$2)`,[id,days]),
 pool.query(`SELECT to_char(message_at AT TIME ZONE 'Asia/Hong_Kong','YYYY-MM-DD') AS day,count(*) FILTER(WHERE kind='text')::int AS messages,coalesce(sum(amount) FILTER(WHERE kind='tip'),0)::float AS tokens FROM chat_events WHERE model_id=$1 AND message_at>now()-make_interval(days=>$2) GROUP BY 1 ORDER BY 1`,[id,days]),
 pool.query('SELECT * FROM chat_coverage WHERE model_id=$1 ORDER BY started_at DESC LIMIT 30',[id]),
 pool.query(`SELECT room_status,sum(extract(epoch from ended_at-greatest(started_at,now()-make_interval(days=>$2))))::float AS seconds FROM broadcast_intervals WHERE model_id=$1 AND ended_at>now()-make_interval(days=>$2) AND room_status IS NOT NULL GROUP BY room_status`,[id,days]),
 pool.query(`WITH observations AS (SELECT observed_at,interval_seconds,CASE WHEN room_status IN ('private','p2p') THEN 'private' ELSE room_status END AS state FROM broadcast_observations WHERE model_id=$1 AND error IS NULL), changes AS (SELECT *,lag(state) OVER(ORDER BY observed_at) AS previous,lag(observed_at) OVER(ORDER BY observed_at) AS previous_time FROM observations) SELECT state,count(*)::int AS count FROM changes WHERE observed_at>now()-make_interval(days=>$2) AND (state IS DISTINCT FROM previous OR observed_at-previous_time>make_interval(secs=>greatest(20,interval_seconds*3))) GROUP BY state`,[id,days])
 ]);
 res.json({totals:totals.rows[0],daily:daily.rows,coverage:coverage.rows,states:states.rows,counts:counts.rows,status:chatMonitorState().active.find(c=>c.modelId===id)?.status||'not_connected',days});
});
