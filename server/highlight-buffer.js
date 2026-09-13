import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {FFMPEG,inputArgs,runProcess,probe} from './media.js';
import {captureInputArgs} from './capture-input.js';

export function parseSegments(csv){
 return csv.trim().split(/\r?\n/).flatMap(line=>{const m=/^"?(part-\d+\.ts)"?,([\d.]+),([\d.]+)$/.exec(line);return m&&Number(m[3])>Number(m[2])?[{name:m[1],start:Number(m[2]),end:Number(m[3])}]:[];});
}
export async function startBuffer(directory,input){
 await fs.mkdir(directory,{recursive:true});
 const child=spawn(process.execPath,[fileURLToPath(new URL('./highlight-process.js',import.meta.url)),FFMPEG,'-hide_banner','-loglevel','error',...inputArgs(input.url),...captureInputArgs(input),'-i',input.url,'-map','0:v:0?','-map','0:a:0?','-c','copy','-f','segment','-segment_time','10','-reset_timestamps','1','-segment_list','segments.csv','-segment_list_type','csv','-segment_list_size','120','part-%09d.ts'],{cwd:directory,windowsHide:true,stdio:['pipe','ignore','pipe']});
 const buffer={directory,child,closed:false,error:'',anchor:null,segments:[],created:Date.now(),lastMedia:Date.now()};
 child.stdin.on('error',()=>{});child.stderr.on('data',d=>{buffer.error=(buffer.error+d).slice(-1000);});
 buffer.done=new Promise(resolve=>{child.on('error',e=>{buffer.error=e.message;});child.on('close',()=>{buffer.closed=true;resolve();});});
 return buffer;
}
export async function readBuffer(buffer){
 const csv=await fs.readFile(path.join(buffer.directory,'segments.csv'),'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});
 const incoming=parseSegments(csv).filter(s=>!buffer.prunedThrough||s.name>buffer.prunedThrough);
 const segments=[...new Map([...buffer.segments,...incoming].map(s=>[s.name,s])).values()].sort((a,b)=>a.start-b.start);
 if(segments.length){const last=segments.at(-1);if(last.name!==buffer.segments.at(-1)?.name)buffer.lastMedia=Date.now();if(buffer.anchor==null){const stat=await fs.stat(path.join(buffer.directory,last.name));buffer.anchor=stat.mtimeMs-last.end*1000;}}
 buffer.segments=segments;return segments;
}
export async function pruneBuffer(buffer,keepAfter){
 const names=await fs.readdir(buffer.directory);const latest=buffer.segments.at(-1);
 if(!latest)return;
 const keep=new Set(buffer.segments.filter(s=>buffer.anchor+s.end*1000>=keepAfter).map(s=>s.name));
 for(const name of names)if(/^part-\d+\.ts$/.test(name)&&name<=latest.name&&!keep.has(name)){await fs.unlink(path.join(buffer.directory,name));if(!buffer.prunedThrough||name>buffer.prunedThrough)buffer.prunedThrough=name;}
 buffer.segments=buffer.segments.filter(s=>keep.has(s.name));
}
export async function stopBuffer(buffer){
 if(!buffer.closed){buffer.child.stdin.write('q\n',()=>{});const timer=setTimeout(()=>buffer.child.kill(),5000);await buffer.done;clearTimeout(timer);}await readBuffer(buffer);
}
export async function exportBuffer(buffer,{start,end,output}){
 const segments=buffer.segments.filter(s=>buffer.anchor+s.end*1000>start&&buffer.anchor+s.start*1000<end);
 if(!segments.length)throw new Error('没有可归档的视频片段');
 const list=path.join(buffer.directory,'export.txt');await fs.writeFile(list,segments.map(s=>`file '${s.name}'`).join('\n'));
 await runProcess(FFMPEG,['-hide_banner','-loglevel','error','-n','-f','concat','-safe','1','-i',list,'-c','copy','-movflags','+faststart',output],{timeout:120000});
 const info=await probe(output),stat=await fs.stat(output);const duration=Number(info.format?.duration);
 if(!Number.isFinite(duration)||duration<=0)throw new Error('高光视频时长无效');
 return {duration,bytes:stat.size,start:buffer.anchor+segments[0].start*1000,end:buffer.anchor+segments.at(-1).end*1000};
}
export async function cleanBuffer(buffer){
 // Delete only known temporary files in this exact buffer directory, never a recursive tree.
 for(const name of await fs.readdir(buffer.directory))if(/^(part-\d+\.ts|segments\.csv(?:\.tmp)?|export\.txt)$/.test(name))await fs.unlink(path.join(buffer.directory,name));
 await fs.rmdir(buffer.directory);
}
