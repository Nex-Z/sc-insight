import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {FFMPEG,inputArgs,runProcess,probe} from './media.js';
import {captureInputArgs} from './capture-input.js';
import {resolveModelInput} from './model-source.js';
import {resolveLivePlaylist} from './live-manifest.js';

const directory=await fs.mkdtemp(path.join(os.tmpdir(),'model-http-test-'));
const demo='https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
let server,input;
try{
 await runProcess(FFMPEG,['-v','error',...inputArgs(demo),'-i',demo,'-t','12','-map','0:v:0','-map','0:a:0?','-c','copy','-hls_time','2','-hls_list_size','0','-hls_segment_filename',path.join(directory,'part%03d.ts'),path.join(directory,'live.m3u8')],{timeout:60000});
 const playlist=(await fs.readFile(path.join(directory,'live.m3u8'),'utf8')).replace('#EXT-X-ENDLIST','');
 let hits=0;const referer='https://example.org/PublicFixture';
 server=http.createServer(async(req,res)=>{
  if(req.headers.referer!==referer){res.writeHead(403).end();return;}
  const name=new URL(req.url,'http://localhost').pathname.slice(1);
  if(name==='live.m3u8'){res.setHeader('Content-Type','application/vnd.apple.mpegurl');res.end(playlist);return;}
  if(!/^part\d+\.ts$/.test(name)){res.writeHead(404).end();return;}
  try{const bytes=await fs.readFile(path.join(directory,name));hits++;res.end(bytes);}catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}/live.m3u8`;
 assert.equal((await fetch(url)).status,403);
 input=await resolveModelInput({name:'PublicFixture',source_id:'1'},{resolver:async()=>({status:'resolved',modelId:'1',pageUrl:referer,url:await resolveLivePlaylist(url,{Referer:referer})})});
 const output=path.resolve('artifacts/model-http-fixture.mp4');await fs.mkdir(path.dirname(output),{recursive:true});
 await runProcess(FFMPEG,['-v','error','-y',...inputArgs(input.url),...captureInputArgs(input),'-live_start_index','0','-i',input.url,'-t','3','-c','copy',output],{timeout:30000});
 const info=await probe(output);assert.ok(Number(info.format.duration)>=2);assert.ok(hits>0);
 console.log(JSON.stringify({ok:true,transport:'HTTP + FFmpeg',browser:false,duration:Number(info.format.duration),segmentsRequested:hits,output}));
}finally{
 input?.close();
 if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 await fs.rm(directory,{recursive:true,force:true});
}
