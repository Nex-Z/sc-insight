import {saveHighlightCapacity} from './highlight-capacity.js';
import express from 'express';
import fs from 'node:fs/promises';
import {pool} from './db.js';
import {safeFile} from './media.js';
import {highlightState,syncHighlights,highlightCapacity} from './highlights.js';
import {validateHighlightSettings} from './highlight-detection.js';
import {syncGoalMonitor} from './goal-monitor.js';
export const highlightRoutes=express.Router();
highlightRoutes.get('/highlights/capacity',(req,res)=>res.set('Cache-Control','no-store').json(highlightCapacity()));
highlightRoutes.put('/highlights/capacity',async(req,res)=>{try{await saveHighlightCapacity(req.body.concurrency);}catch(e){return res.status(400).json({error:e.message});}void syncHighlights();res.json(highlightCapacity());});
highlightRoutes.param('modelId',(req,res,next,value)=>{if(!/^[1-9]\d{0,9}$/.test(value))return res.status(400).json({error:'主播 ID 无效'});next();});
highlightRoutes.get('/models/:modelId/highlights',async(req,res)=>{
 const id=Number(req.params.modelId),before=req.query.before;
 if(before&&!/^[1-9]\d{0,18}$/.test(before))return res.status(400).json({error:'分页参数无效'});
 if(!(await pool.query('SELECT 1 FROM models WHERE id=$1',[id])).rowCount)return res.status(404).json({error:'主播不存在'});
 const [settings,records,goal]=await Promise.all([pool.query('SELECT enabled,config FROM highlight_settings WHERE model_id=$1',[id]),pool.query('SELECT id,triggered_at,last_trigger_at,started_at,finished_at,reasons,status,duration_seconds,bytes,error,end_reason,end_room_status FROM highlights WHERE model_id=$1 AND ($2::bigint IS NULL OR id<$2) ORDER BY id DESC LIMIT 21',[id,before||null]),pool.query('SELECT state,error,updated_at FROM goal_monitor_state WHERE model_id=$1',[id])]);
 res.set('Cache-Control','no-store').json({enabled:settings.rows[0]?.enabled||false,config:validateHighlightSettings(settings.rows[0]?.config),state:highlightState(id),capacity:highlightCapacity(),goal:goal.rows[0]||null,items:records.rows.slice(0,20),nextBefore:records.rows.length>20?records.rows[19].id:null});
});
highlightRoutes.put('/models/:modelId/highlights',async(req,res)=>{
 if(typeof req.body.enabled!=='boolean')return res.status(400).json({error:'enabled 必须是布尔值'});
 let config;try{config=validateHighlightSettings(req.body.config);}catch(e){return res.status(400).json({error:e.message});}
 if(req.body.enabled&&!config.viewerRecord&&!config.tipRecord&&!config.goalRecord)return res.status(400).json({error:'请至少选择一种要录制的高光'});
 const db=await pool.connect();
 try{
  await db.query('BEGIN');const r=await db.query('SELECT id FROM models WHERE id=$1 FOR UPDATE',[req.params.modelId]);if(!r.rowCount){await db.query('ROLLBACK');return res.status(404).json({error:'主播不存在'});}
  await db.query('INSERT INTO highlight_settings(model_id,enabled,config) VALUES($1,$2,$3) ON CONFLICT(model_id) DO UPDATE SET enabled=excluded.enabled,config=excluded.config,updated_at=now()',[req.params.modelId,req.body.enabled,config]);
  if(req.body.enabled||config.goalNotify)await db.query('UPDATE models SET monitored=true WHERE id=$1',[req.params.modelId]);
  await db.query('COMMIT');void syncHighlights();void syncGoalMonitor();res.json({ok:true,enabled:req.body.enabled,config});
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
});
highlightRoutes.get('/highlights/:id/file',async(req,res)=>{
 if(!/^[1-9]\d{0,18}$/.test(req.params.id))return res.status(400).json({error:'高光 ID 无效'});
 const {rows:[h]}=await pool.query('SELECT * FROM highlights WHERE id=$1',[req.params.id]);if(!h)return res.status(404).json({error:'高光不存在'});
 if(!['已完成','已中断'].includes(h.status))return res.status(409).json({error:'高光尚未归档'});
 let file;try{file=safeFile(h);await fs.access(file);}catch{return res.status(404).json({error:'片段文件不可用，可能在录制中断前尚未生成'});}
 res.set('Cache-Control','private, no-store');const done=e=>{if(e&&!res.headersSent)res.status(404).json({error:'读取高光失败'});};
 if(req.query.download==='1')res.download(file,h.filename,done);else res.sendFile(file,{headers:{'Content-Type':'video/mp4'}},done);
});
