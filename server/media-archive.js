import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {FFMPEG,probe,runProcess} from './media.js';

export function requestMediaStop(job,{reason,failure,timeout=10000}={}){
 if(job.closed)return;
 if(reason&&!job.stopReason)job.stopReason=reason;
 if(failure&&!job.failure)job.failure=failure;
 if(job.stopRequested)return;
 job.stopRequested=true;
 job.child.stdin.write('q\n',()=>{});
 job.killTimer=setTimeout(()=>job.child.kill(),timeout);
}

export async function inspectArchive(file){
 const info=await probe(file),stat=await fs.stat(file);
 const duration=Number(info.format?.duration);
 if(!Number.isFinite(duration)||duration<=0||stat.size<100)throw new Error('未收到可归档的视频数据');
 return {file,duration,bytes:stat.size,recovered:false};
}

// Never replace the only source. A recovered sibling becomes the archive only
// after probing it; the original remains available for further recovery.
export async function recoverArchive(file,{inspect=inspectArchive}={}){
 try{return await inspect(file);}catch(originalError){
  const stat=await fs.stat(file);
  if(stat.size<100)throw originalError;
  const output=path.join(path.dirname(file),path.basename(file,'.mp4')+'-recovered-'+randomUUID()+'.mp4');
  try{
   let conversionError;
   try{await runProcess(FFMPEG,['-hide_banner','-loglevel','error','-n','-fflags','+discardcorrupt','-err_detect','ignore_err','-i',file,'-map','0:v:0?','-map','0:a:0?','-c','copy','-movflags','+faststart',output],{timeout:600000});}
   catch(e){conversionError=e;}
   // FFmpeg can report a broken tail after writing valid earlier packets.
   try{return {...await inspect(output),recovered:true};}
   catch(e){throw conversionError||e;}
  }catch(e){await fs.unlink(output).catch(()=>{});throw e;}
 }
}
