import {modelSearchRoutes} from './model-search-routes.js';
import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pool} from './db.js';
import {collect} from './collector.js';
import {validateRule} from './validation.js';
import {getStorage,saveStorage} from './storage.js';
import {recordingRoutes} from './recording-routes.js';
import {startWorker,shutdownWorker,autoRecord,workerState} from './recorder.js';
import {browserRoutes} from './browser-routes.js';
import {browserCapture} from './browser-capture.js';
const app=express();app.use(express.json({limit:'64kb'}));
app.use('/api',(req,res,next)=>{if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin){const origin=new URL(req.headers.origin);if(origin.host!==req.headers.host)return res.status(403).json({error:'不允许跨站写入'});}next();});
app.use('/api/browser-capture',browserRoutes);
app.use('/api',recordingRoutes);
app.use('/api',modelSearchRoutes);
app.get('/api/storage',async(req,res)=>res.json(await getStorage()));
app.put('/api/storage',async(req,res)=>{try{res.json(await saveStorage(req.body.directory));}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/state',async(req,res)=>{
 const [models,rules,recordings,events,runs,history,heatmap]=await Promise.all([
 pool.query("SELECT m.*, m.last_seen_at > now()-interval '3 minutes' AS fresh, s.model_id IS NOT NULL AS has_source, coalesce(s.auto_record,false) AS auto_record, coalesce(s.until_offline,false) AS until_offline FROM models m LEFT JOIN recording_sources s ON s.model_id=m.id ORDER BY m.viewers DESC"),pool.query('SELECT * FROM monitor_rules ORDER BY id'),pool.query('SELECT r.id,r.model_id,r.filename,r.status,r.duration,r.size,r.created_at,r.directory,r.bytes,r.duration_seconds,r.max_seconds,r.until_offline,r.started_at,r.finished_at,r.error,m.name FROM recordings r LEFT JOIN models m ON m.id=r.model_id ORDER BY r.created_at DESC'),pool.query('SELECT e.*,m.name FROM events e LEFT JOIN models m ON m.id=e.model_id ORDER BY e.created_at DESC LIMIT 50'),pool.query('SELECT * FROM collection_runs ORDER BY id DESC LIMIT 1'),
 pool.query("SELECT date_trunc('minute',sampled_at) AS time,sum(viewers)::float AS value FROM model_snapshots WHERE sampled_at>now()-interval '24 hours' GROUP BY 1 ORDER BY 1"),
 pool.query("SELECT extract(isodow from sampled_at AT TIME ZONE 'Asia/Hong_Kong')::int AS day,extract(hour from sampled_at AT TIME ZONE 'Asia/Hong_Kong')::int AS hour,avg(viewers)::float AS value FROM model_snapshots WHERE sampled_at>now()-interval '7 days' GROUP BY 1,2")]);
 res.json({worker:workerState(),models:models.rows,rules:rules.rows,recordings:recordings.rows,events:events.rows,collector:runs.rows[0]||null,history:history.rows,heatmap:heatmap.rows,mode:'live',scope:'公开列表抽样 · 每 60 秒采集 · 非全站统计'});
});
app.post('/api/collect',async(req,res)=>{res.json(await collect());});
app.patch('/api/models/:id',async(req,res)=>{
 const allowed=['favorite','monitored','note'];const keys=Object.keys(req.body);
 if(!keys.length||keys.some(k=>!allowed.includes(k))||keys.some(k=>k==='note'?(typeof req.body[k]!=='string'||req.body[k].length>500):typeof req.body[k]!=='boolean'))return res.status(400).json({error:'无效更新'});
 const values=keys.map(k=>req.body[k]);values.push(req.params.id);
 const result=await pool.query(`UPDATE models SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} WHERE id=$${values.length} RETURNING *`,values);
 if(!result.rowCount)return res.status(404).json({error:'主播不存在'});res.json(result.rows[0]);
});
app.get('/api/models/:id/history',async(req,res)=>{
 const days=Number(req.query.days||7);if(![7,30,90].includes(days))return res.status(400).json({error:'无效时间范围'});
 const {rows}=await pool.query("SELECT date_trunc('minute',sampled_at) AS time,avg(viewers)::float AS value FROM model_snapshots WHERE model_id=$1 AND sampled_at>now()-make_interval(days=>$2) GROUP BY 1 ORDER BY 1",[req.params.id,days]);res.json(rows);
});
app.post('/api/rules',async(req,res)=>{const value=validateRule(req.body);if(!value || !/^(主播上线时|观众数 ≥ [1-9]\d{0,7})$/.test(value.condition))return res.status(400).json({error:'请填写名称及有效触发条件'});res.status(201).json((await pool.query('INSERT INTO monitor_rules(name,condition) VALUES($1,$2) RETURNING *',[value.name,value.condition])).rows[0]);});
app.patch('/api/rules/:id',async(req,res)=>{if(typeof req.body.enabled!=='boolean')return res.status(400).json({error:'enabled 必须是布尔值'});const r=await pool.query('UPDATE monitor_rules SET enabled=$2 WHERE id=$1 RETURNING *',[req.params.id,req.body.enabled]);if(!r.rowCount)return res.status(404).json({error:'规则不存在'});res.json(r.rows[0]);});
app.delete('/api/rules/:id',async(req,res)=>{const r=await pool.query('DELETE FROM monitor_rules WHERE id=$1',[req.params.id]);if(!r.rowCount)return res.status(404).json({error:'规则不存在'});res.json({ok:true});});

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');app.use(express.static(path.join(root,'dist')));app.get('/{*path}',(req,res)=>res.sendFile(path.join(root,'dist/index.html')));
app.use((err,req,res,next)=>{console.error(err.message);res.status(500).json({error:'操作失败，请检查数据库或采集服务。',detail:err.message});});
await startWorker();
const server=app.listen(Number(process.env.PORT||3010),process.env.HOST||'127.0.0.1',()=>console.log('SC Insight http://127.0.0.1:3010'));
const tick=()=>{void collect().then(r=>console.log('Collected',r.count??'busy')).catch(e=>console.error('Collector:',e.message));void autoRecord().catch(e=>console.error('Auto recorder:',e.message));};tick();const timer=setInterval(tick,60000);
let shuttingDown=false;async function shutdown(){if(shuttingDown)return;shuttingDown=true;clearInterval(timer);server.close();await browserCapture.disconnect();await shutdownWorker();await pool.end();process.exit();}process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);


