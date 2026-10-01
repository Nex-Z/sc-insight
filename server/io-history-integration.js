import assert from 'node:assert/strict';
import {pool} from './db.js';
import {broadcastSchema,recordBroadcast} from './broadcast-history.js';
import {ObservationBuffer,groupObservations} from './observation-buffer.js';
const db=await pool.connect();
try{
 await db.query('BEGIN');await db.query('SET LOCAL search_path=pg_temp');
 await db.query("CREATE TEMP TABLE models(id integer PRIMARY KEY,name text,favorite boolean,monitored boolean);CREATE TEMP TABLE events(model_id integer,title text,detail text,kind text,payload jsonb,created_at timestamptz);");
 await db.query(broadcastSchema.replaceAll('CREATE TABLE IF NOT EXISTS','CREATE TEMP TABLE'));
 await db.query('ALTER TABLE broadcast_intervals ADD COLUMN room_status text');
 await db.query("INSERT INTO models VALUES(1,'raw',true,true),(2,'buffered',true,true)");
 const buffer=new ObservationBuffer(),start=Date.now()-600000;
 async function flush(){const rows=buffer.pending(2);for(const g of groupObservations(rows)){
  if(g.sample.error){await db.query('INSERT INTO broadcast_observations(model_id,observed_at,error,interval_seconds) VALUES(2,$1,$2,5)',[g.sample.observed_at,g.sample.error]);await db.query('UPDATE broadcast_sessions SET incomplete=true WHERE model_id=2 AND ended_at IS NULL');}
  else await recordBroadcast(db,2,g.sample,5,new Date(g.sample.observed_at),g.summary);
 }buffer.committed(2,rows.length);}
 const points=[];
 for(let seconds=0;seconds<=240;seconds+=5){
  if(seconds>130&&seconds<170)continue;
  const online=seconds>0&&seconds<225;
  points.push({seconds,...(seconds===90?{error:'fixture gap'}:{online,room_status:online?(seconds>=110&&seconds<125?'private':'public'):'offline',viewers:seconds===100?null:100+seconds%25})});
 }
 for(const {seconds,...s} of points){const now=start+seconds*1000;
  if(s.error){await db.query('INSERT INTO broadcast_observations(model_id,observed_at,error,interval_seconds) VALUES(1,$1,$2,5)',[new Date(now),s.error]);await db.query('UPDATE broadcast_sessions SET incomplete=true WHERE model_id=1 AND ended_at IS NULL');}
  else await recordBroadcast(db,1,s,5,new Date(now));
  if(buffer.add(2,s,5,now))await flush();
 }
 await flush();
 const sessionSql='SELECT first_seen,last_seen,ended_at,start_known,end_known,incomplete,end_reason,observed_seconds,samples,viewer_samples,viewer_sum,peak_viewers FROM broadcast_sessions WHERE model_id=$1 ORDER BY first_seen';
 const raw=(await db.query(sessionSql,[1])).rows,batched=(await db.query(sessionSql,[2])).rows;assert.deepEqual(batched,raw);
 const intervalSql="SELECT coalesce(sum(extract(epoch FROM ended_at-started_at)),0)::float AS seconds,coalesce(sum(viewer_average*extract(epoch FROM ended_at-started_at)),0)::float AS area FROM broadcast_intervals WHERE model_id=$1";
 assert.deepEqual((await db.query(intervalSql,[2])).rows,(await db.query(intervalSql,[1])).rows);
 const events=await db.query('SELECT model_id,kind,created_at FROM events ORDER BY created_at,kind');assert.deepEqual(events.rows.filter(x=>x.model_id===2).map(({model_id,...x})=>x),events.rows.filter(x=>x.model_id===1).map(({model_id,...x})=>x));
 const counts=(await db.query('SELECT model_id,count(*)::int AS count FROM broadcast_observations GROUP BY model_id ORDER BY model_id')).rows;
 assert.ok(counts[1].count<counts[0].count/2);console.log(JSON.stringify({ok:true,counts,sessions:raw.length,checks:['exact durations','weighted viewer totals','peak viewers','transition times','failure and gap semantics']}));
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
