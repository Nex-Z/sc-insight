import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {FFMPEG,runProcess,probe} from './media.js';

// Fragmented capture files keep recording recoverable, but lack a front-loaded
// seek index. Serve a stream-copy faststart version without changing the source.
const root=path.join(os.tmpdir(),'sc-insight-playback');
const pending=new Map();let serial=Promise.resolve();
export async function mp4NeedsIndex(file){
 const handle=await fs.open(file,'r');
 try{
  const {size}=await handle.stat();let offset=0,sawMedia=false;
  while(offset+8<=size){
   const header=Buffer.alloc(16);const {bytesRead}=await handle.read(header,0,16,offset);if(bytesRead<8)return false;
   let length=header.readUInt32BE(0);const type=header.toString('ascii',4,8);
   if(length===1){if(bytesRead<16)return false;const big=header.readBigUInt64BE(8);if(big>BigInt(Number.MAX_SAFE_INTEGER))return false;length=Number(big);}
   if(type==='moof')return true;
   if(type==='mdat')sawMedia=true;
   if(type==='moov'){
    if(sawMedia)return true;
    // empty_moov captures advertise mvex; only read the small metadata box.
    if(length>8&&length<16*1024*1024){const data=Buffer.alloc(length-8);await handle.read(data,0,data.length,offset+8);if(data.includes(Buffer.from('mvex')))return true;}
    return false;
   }
   if(length<8||offset+length>size)return false;offset+=length;
  }
  return false;
 }finally{await handle.close();}
}
async function cleanCache(){
 const entries=await fs.readdir(root,{withFileTypes:true});const files=[];
 for(const entry of entries){if(!entry.isFile()||!entry.name.endsWith('.mp4'))continue;const file=path.join(root,entry.name),stat=await fs.stat(file).catch(()=>null);if(stat)files.push({file,...stat});}
 files.sort((a,b)=>a.mtimeMs-b.mtimeMs);let total=files.reduce((n,f)=>n+f.size,0);
 for(const file of files){if(Date.now()-file.mtimeMs>86400000||total>4*1024**3){try{await fs.unlink(file.file);total-=file.size;}catch{}}}
}
export async function playbackFile(file){
 if(!await mp4NeedsIndex(file))return file;
 const source=await fs.stat(file),key=createHash('sha256').update(`${file}:${source.size}:${source.mtimeMs}`).digest('hex');
 await fs.mkdir(root,{recursive:true});const output=path.join(root,key+'.mp4');
 if(await fs.stat(output).then(s=>s.size>0).catch(()=>false))return output;
 if(pending.has(key))return pending.get(key);
 const task=serial.catch(()=>{}).then(async()=>{
  await cleanCache();if(await fs.stat(output).then(s=>s.size>0).catch(()=>false))return output;
  const disk=await fs.statfs(root);if(disk.bavail*disk.bsize<source.size+256*1024**2)throw new Error('播放缓存空间不足');
  const temp=path.join(root,key+'-'+randomUUID()+'.tmp.mp4');
  try{
   await runProcess(FFMPEG,['-hide_banner','-loglevel','error','-n','-i',file,'-map','0:v:0?','-map','0:a:0?','-c','copy','-movflags','+faststart',temp],{timeout:600000});
   await probe(temp);
   const latest=await fs.stat(file);if(latest.size!==source.size||latest.mtimeMs!==source.mtimeMs)throw new Error('媒体文件已变化');
   await fs.rename(temp,output);return output;
  }finally{await fs.unlink(temp).catch(()=>{});}
 });
 serial=task;pending.set(key,task);try{return await task;}finally{pending.delete(key);}
}
