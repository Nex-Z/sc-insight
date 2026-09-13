import express from 'express';
import fs from 'node:fs/promises';
import {pool} from './db.js';
import {createRecording,stopRecording,workerState,autoRecord} from './recorder.js';
import {sourceUrl,safeFile,probe,redact,ACTIVE} from './media.js';
import {findRecordingTarget,resolveModelInput} from './model-source.js';
import {resolvePublicSource,inspectPublicRoom} from './public-source.js';
export const recordingRoutes=express.Router();
recordingRoutes.post('/recording-target/resolve',async(req,res)=>{
 res.set('Cache-Control','no-store');
 try{
  const model=await findRecordingTarget(pool,req.body.target);
  const source=await resolvePublicSource(model.name);
  if(model.source_id&&String(source.modelId)!==model.source_id)throw new Error('主播 ID 不匹配');
  res.json({name:source.name,source_id:source.modelId,status:source.status,reason:source.reason,transport:'http'});
 }catch(e){res.status(422).json({error:redact(e.message)});}
});
recordingRoutes.post('/recordings/by-target',async(req,res)=>{
 try{
  const seconds=req.body.max_seconds??3600;
  if(!Number.isInteger(seconds)||seconds<5||seconds>21600)throw new Error('录制时长必须在 5 秒至 6 小时之间');
  const auto=req.body.auto_record??false;if(typeof auto!=='boolean')throw new Error('自动录制选项必须是布尔值');
  const continuous=req.body.until_offline??auto;
  if(typeof continuous!=='boolean'||(continuous&&!auto))throw new Error('录到下线选项仅支持自动录制');
  let model=await findRecordingTarget(pool,req.body.target);
  if(!model.id){
   const source=auto?await inspectPublicRoom(model.name):await resolvePublicSource(model.name);
   if(!auto&&source.status!=='resolved')throw new Error(source.reason);
   model=(await pool.query(`INSERT INTO models(name,source_id,country,language,color,room_status,online)
    VALUES($1,$2,'未知','未知','#8a6b77',$3,$4)
    ON CONFLICT(source_id) DO UPDATE SET name=excluded.name RETURNING *`,[source.name,source.modelId,auto?source.status:'public',auto?source.online:true])).rows[0];
  }
  if(auto){
   await pool.query('INSERT INTO recording_sources(model_id,url,auto_record,max_seconds,until_offline) VALUES($1,NULL,true,$2,$3) ON CONFLICT(model_id) DO UPDATE SET url=NULL,auto_record=true,max_seconds=excluded.max_seconds,until_offline=excluded.until_offline,updated_at=now()',[model.id,seconds,continuous]);
   void autoRecord();
   return res.status(202).json({model_id:model.id,status:'等待上线',auto_record:true});
  }
  const task=await createRecording(model.id,seconds,{publicSource:true,autoRecord:auto,untilOffline:false});
  res.status(201).json(task);
 }catch(e){res.status(400).json({error:redact(e.message)});}
});
recordingRoutes.get('/recording-sources',async(req,res)=>{
 const {rows}=await pool.query('SELECT s.model_id,s.url,s.auto_record,s.max_seconds,s.until_offline,s.updated_at,m.name FROM recording_sources s JOIN models m ON m.id=s.model_id ORDER BY m.name');
 res.json({sources:rows.map(({url,...s})=>({...s,type:url?'url':'public',host:url?new URL(url).host:null})),worker:workerState()});
});
recordingRoutes.patch('/recording-sources/:modelId',async(req,res)=>{
 if(req.body.auto_record!==false)return res.status(400).json({error:'此接口仅用于关闭自动录制'});
 await pool.query('UPDATE recording_sources SET auto_record=false,updated_at=now() WHERE model_id=$1',[req.params.modelId]);
 res.json({ok:true});
});
recordingRoutes.put('/recording-sources/:modelId',async(req,res)=>{
 const {url,auto_record=false,max_seconds=3600,until_offline=false}=req.body;
 if(typeof auto_record!=='boolean'||!Number.isInteger(max_seconds)||max_seconds<5||max_seconds>21600)return res.status(400).json({error:'请设置 5 秒至 6 小时的录制时长'});
 const modelId=Number(req.params.modelId);if(!Number.isInteger(modelId)||modelId<1)return res.status(400).json({error:'请选择主播'});
 if(!(await pool.query('SELECT 1 FROM models WHERE id=$1',[modelId])).rowCount)return res.status(404).json({error:'主播不存在'});
 let value;try{value=req.body.type==='public'?null:url?sourceUrl(url):(await pool.query('SELECT url FROM recording_sources WHERE model_id=$1',[modelId])).rows[0]?.url;if(value===undefined)throw new Error('请填写直播源地址或选择按主播解析');}catch(e){return res.status(400).json({error:e.message});}
 if(typeof until_offline!=='boolean'||(until_offline&&(!auto_record||value!==null)))return res.status(400).json({error:'录到下线仅支持按主播自动录制'});
 await pool.query('INSERT INTO recording_sources(model_id,url,auto_record,max_seconds,until_offline) VALUES($1,$2,$3,$4,$5) ON CONFLICT(model_id) DO UPDATE SET url=excluded.url,auto_record=excluded.auto_record,max_seconds=excluded.max_seconds,until_offline=excluded.until_offline,updated_at=now()',[modelId,value,auto_record,max_seconds,until_offline]);
 res.json({ok:true});
});
recordingRoutes.post('/recording-sources/:modelId/probe',async(req,res)=>{
 const {rows:[source]}=await pool.query('SELECT url FROM recording_sources WHERE model_id=$1',[req.params.modelId]);if(!source)return res.status(404).json({error:'尚未配置直播源'});
 let input;
 try{
  if(source.url){const info=await probe(source.url,true);res.json({ok:true,streams:info.streams});}
  else{const {rows:[model]}=await pool.query('SELECT * FROM models WHERE id=$1',[req.params.modelId]);input=await resolveModelInput(model);res.json({ok:true,streams:input.streams});}
 }catch(e){res.status(422).json({error:redact(e.message)});}finally{input?.close();}
});
recordingRoutes.post('/recordings',async(req,res)=>{try{res.status(201).json(await createRecording(req.body.model_id,req.body.max_seconds));}catch(e){res.status(400).json({error:redact(e.message)});}});
recordingRoutes.post('/recordings/:id/stop',async(req,res)=>{try{res.json(await stopRecording(req.params.id));}catch(e){res.status(400).json({error:redact(e.message)});}});
recordingRoutes.get('/recordings/:id/file',async(req,res,next)=>{
 const {rows:[record]}=await pool.query('SELECT * FROM recordings WHERE id=$1',[req.params.id]);if(!record)return res.status(404).json({error:'录像不存在'});
 if(!['已完成','已中断'].includes(record.status))return res.status(409).json({error:'录像尚未归档，请等待完成后播放'});
 let file;try{file=safeFile(record);await fs.access(file);}catch{return res.status(404).json({error:'录像文件不存在或存储目录不可访问'});}
 res.set('Cache-Control','private, no-store');
 const done=e=>{if(e&&!res.headersSent)res.status(e.statusCode===404?404:500).json({error:'读取录像文件失败'});};
 if(req.query.download==='1')res.download(file,record.filename,done);else res.sendFile(file,{headers:{'Content-Type':'video/mp4'}},done);
});
recordingRoutes.delete('/recordings/:id',async(req,res)=>{
 const {rows:[record]}=await pool.query('SELECT * FROM recordings WHERE id=$1',[req.params.id]);if(!record)return res.status(404).json({error:'录像不存在'});
 if(ACTIVE.includes(record.status))return res.status(409).json({error:'请先停止录制，再删除录像'});
 if(record.directory){try{await fs.unlink(safeFile(record));}catch(e){if(e.code!=='ENOENT')return res.status(409).json({error:'文件可能正在使用或存储不可访问，未删除记录'});}}
 await pool.query('DELETE FROM recordings WHERE id=$1',[record.id]);res.json({ok:true});
});
