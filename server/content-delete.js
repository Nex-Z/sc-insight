import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {pool} from './db.js';
import {getStorage} from './storage.js';
import {safeFile,ACTIVE} from './media.js';

const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function checkedMediaFile(record,root){
 if(!record.directory)return null;
 const file=safeFile(record),relative=path.relative(path.resolve(root),file);
 if(relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative))throw fail(409,'文件不在当前录像目录内，未删除');
 let info;try{info=await fs.lstat(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(!info.isFile()||info.isSymbolicLink())throw fail(409,'文件类型异常，未删除');
 const realRoot=await fs.realpath(root),realFile=await fs.realpath(file),realRelative=path.relative(realRoot,realFile);
 if(realRelative.startsWith('..'+path.sep)||realRelative==='..'||path.isAbsolute(realRelative))throw fail(409,'文件路径超出录像目录，未删除');
 return file;
}

export async function deleteContent(kind,id,{dbPool=pool,storage=getStorage,protectFavorite=false}={}){
 if(!['recording','highlight'].includes(kind)||!/^\d{1,19}$/.test(String(id))||BigInt(id)<=0n||BigInt(id)>9223372036854775807n)throw fail(400,'无效内容 ID');
 const table=kind==='recording'?'recordings':'highlights',db=await dbPool.connect();
 let staged,file,committed=false;
 try{
  await db.query('BEGIN');
  const {rows:[record]}=await db.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[id]);
  if(!record)throw fail(404,'内容不存在或已删除');
  if(ACTIVE.includes(record.status))throw fail(409,'正在录制或归档，请结束后再删除');
  if(protectFavorite){const {rows:[metadata]}=await db.query('SELECT favorite FROM content_metadata WHERE kind=$1 AND item_id=$2 FOR UPDATE',[kind,id]);if(metadata?.favorite)throw fail(409,'已收藏的内容已跳过，请先取消收藏');}
  file=await checkedMediaFile(record,(await storage()).directory);
  if(file){const target=file+'.deleting-'+randomUUID();await fs.rename(file,target);staged=target;}
  await db.query('DELETE FROM content_metadata WHERE kind=$1 AND item_id=$2',[kind,id]);
  await db.query(`DELETE FROM ${table} WHERE id=$1`,[id]);
  await db.query('COMMIT');committed=true;
  if(staged){try{await fs.unlink(staged);}catch{console.error('待清理的删除文件:',staged);return {ok:true,warning:'记录已删除，但视频文件清理失败，磁盘空间尚未释放，请联系管理员清理。'};}}
  return {ok:true};
 }catch(e){
  if(!committed){await db.query('ROLLBACK').catch(()=>{});if(staged)await fs.rename(staged,file);}
  if(e.status)throw e;
  throw fail(409,'文件正在使用或存储操作失败，未完成删除，请重试');
 }finally{db.release();}
}

export const deleteContentRoute=kind=>async(req,res)=>{
 if(req.body?.confirm!==true)return res.status(400).json({error:'请确认删除视频文件及内容信息'});
 try{res.json(await deleteContent(kind||req.params.kind,req.params.id,{protectFavorite:req.body.protectFavorite===true}));}catch(e){res.status(e.status||500).json({error:e.message});}
};
