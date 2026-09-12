import express from 'express';
import {pool} from './db.js';
import {searchOfficialModels} from './model-search.js';
export const modelSearchRoutes=express.Router();
modelSearchRoutes.post('/models/search',async(req,res)=>{
 res.set('Cache-Control','no-store');
 if(typeof req.body.query!=='string'||!req.body.query.trim()||req.body.query.trim().length>80)return res.status(400).json({error:'请输入 1–80 个字符的搜索词'});
 try{
  const result=await searchOfficialModels(req.body.query);const db=await pool.connect();
  try{
   await db.query('BEGIN');const models=[];
   for(const m of result.models){
    const {rows:[local]}=await db.query(`INSERT INTO models(name,source_id,country,language,color,online,room_status,last_seen_at,cover_url,avatar_url)
     VALUES($1,$2,$3,'未知','#8a6b77',$4,$5,NULL,$6,$7)
     ON CONFLICT(source_id) DO UPDATE SET cover_url=excluded.cover_url,avatar_url=excluded.avatar_url RETURNING *`,[m.name,m.source_id,m.country,m.online,m.room_status,m.cover_url,m.avatar_url]);
    models.push({...local,...m,id:local.id});
   }
   await db.query('COMMIT');res.json({...result,models});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }catch(e){res.status(502).json({error:e.code?'搜索结果收录失败，请重试':e.message});}
});
