import {pool} from './db.js';

// Share one refresh across tabs and requests; failed refreshes are never cached.
export function createDashboardLoader(db, {now=Date.now, ttl=180000}={}) {
 let value, expires=0, pending;
 return function load() {
  if(value && now()<expires)return Promise.resolve(value);
  if(pending)return pending;
  pending=Promise.all([
   db.query("SELECT time,sum(viewers)::float AS value FROM (SELECT date_trunc('minute',sampled_at) AS time,model_id,avg(viewers) AS viewers FROM model_snapshots WHERE sampled_at>now()-interval '24 hours' AND scope='general' GROUP BY 1,2) samples GROUP BY time ORDER BY time"),
   db.query("SELECT extract(isodow from time AT TIME ZONE 'Asia/Hong_Kong')::int AS day,extract(hour from time AT TIME ZONE 'Asia/Hong_Kong')::int AS hour,avg(viewers)::float AS value FROM (SELECT date_trunc('minute',sampled_at) AS time,model_id,avg(viewers) AS viewers FROM model_snapshots WHERE sampled_at>now()-interval '7 days' AND scope='general' GROUP BY 1,2) samples GROUP BY 1,2")
  ]).then(([history,heatmap])=>{
   value={history:history.rows,heatmap:heatmap.rows,generatedAt:new Date(now()).toISOString()};
   expires=now()+ttl;return value;
  }).finally(()=>{pending=null;});
  return pending;
 };
}
export const loadDashboard=createDashboardLoader(pool);
