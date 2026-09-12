import {spawn} from 'node:child_process';
import path from 'node:path';
import {captureInputArgs} from './capture-input.js';
export const FFMPEG=process.env.FFMPEG_PATH||'ffmpeg';
export const FFPROBE=process.env.FFPROBE_PATH||'ffprobe';
export const ACTIVE=['排队中','连接中','录制中','归档中'];
export function sourceUrl(value){
 if(typeof value!=='string'||value.length>8192)throw new Error('请输入 HTTP / HTTPS 直播源地址');
 let u;try{u=new URL(value.trim());}catch{throw new Error('直播源地址格式无效');}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash)throw new Error('仅支持 HTTP / HTTPS，不支持嵌入用户名密码或文件路径');
 return u.href;
}
export function safeFile(record){
 if(!record.directory||!path.isAbsolute(record.directory)||!record.filename||path.basename(record.filename)!==record.filename)throw new Error('录像路径无效');
 const root=path.resolve(record.directory);const file=path.resolve(root,record.filename);
 if(path.dirname(file)!==root)throw new Error('录像文件不在归档目录内');return file;
}
export function redact(text){return String(text).replace(/https?:\/\/[^\s'"<>]+/gi,'[直播源地址]').slice(-1000);}
export function inputArgs(url){
 const u=new URL(url);const host=u.hostname.toLowerCase();const local=['localhost','127.0.0.1','[::1]'].includes(host);
 const noProxy=(process.env.NO_PROXY||'').split(',').some(n=>n.trim()&&(n.trim()==='*'||host===n.trim()||host.endsWith(n.trim().startsWith('.')?n.trim():'.'+n.trim())));
 const proxy=!local&&!noProxy&&(process.env.HTTPS_PROXY||process.env.HTTP_PROXY);
 return ['-protocol_whitelist','http,https,tcp,tls,crypto,httpproxy','-rw_timeout','15000000',...(proxy?['-http_proxy',proxy]:[])];
}
export function runProcess(binary,args,{timeout=20000}={}){
 return new Promise((resolve,reject)=>{const child=spawn(binary,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',errors='',expired=false;
 const timer=setTimeout(()=>{expired=true;child.kill();},timeout);
 child.stdout.on('data',d=>{output=(output+d).slice(-1048576);});child.stderr.on('data',d=>{errors=(errors+d).slice(-8192);});
 child.on('error',e=>{clearTimeout(timer);reject(new Error(e.code==='ENOENT'?'未找到 FFmpeg / FFprobe，请检查安装或环境配置':redact(e.message)));});
 child.on('close',code=>{clearTimeout(timer);if(code===0)resolve(output);else reject(new Error(expired?'读取媒体超时':redact(errors)||`媒体进程退出 ${code}`));});
 });
}
export async function probe(input,remote=false,request){const output=await runProcess(FFPROBE,['-v','error',...(remote?inputArgs(input):[]),...(request?captureInputArgs(request):[]),'-show_entries','format=duration,size:stream=codec_type,codec_name,width,height','-of','json',input]);const result=JSON.parse(output);if(!result.streams?.some(s=>['video','audio'].includes(s.codec_type)))throw new Error('直播源中没有可用的音视频轨道');return result;}
export const humanDuration=s=>{const n=Math.floor(s||0);return [Math.floor(n/3600),Math.floor(n%3600/60),n%60].map(v=>String(v).padStart(2,'0')).join(':');};
export const humanSize=b=>b>=1073741824?`${(b/1073741824).toFixed(2)} GB`:`${(b/1048576).toFixed(1)} MB`;
