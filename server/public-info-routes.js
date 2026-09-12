import express from 'express';
import {pool} from './db.js';
import {createPublicInfo} from './public-info.js';
export const publicInfoRoutes=express.Router();
const info=createPublicInfo();
for(const [path,method] of [['public-profile','profile'],['room-info','room'],['snapshot','snapshot']])publicInfoRoutes.get('/models/:id/'+path,async(req,res)=>{
 const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'无效主播 ID'});
 try{const {rows}=await pool.query('SELECT name,source_id FROM models WHERE id=$1',[id]);if(!rows.length)return res.status(404).json({error:'主播不存在'});res.set('Cache-Control','no-store').json(await info[method](rows[0]));}catch{res.status(502).json({error:'官网公开资料暂不可用，请稍后重试'});}
});
