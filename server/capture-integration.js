import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {BrowserMediaCapture} from './browser-capture.js';
import {captureInputArgs} from './capture-input.js';
import {FFMPEG,inputArgs,runProcess,probe} from './media.js';

const browser=await chromium.launch({channel:process.env.CAPTURE_TEST_BROWSER||'msedge',headless:true});
const capture=new BrowserMediaCapture();let server;
const securedFiles=new Map();
try {
 const context=await browser.newContext();const page=await context.newPage();await capture.watch(page);
 server=http.createServer((req,res)=>{
  if(req.url.startsWith('/secured/')){
   if(!req.headers.cookie?.split(';').some(c=>c.trim()==='capture_test=existing')||!req.headers.referer?.startsWith(`http://127.0.0.1:${server.address().port}/`)||!req.headers['user-agent']?.includes('Mozilla')){res.writeHead(403);res.end();return;}
   const body=securedFiles.get(req.url);res.writeHead(body?200:404,{'Content-Type':req.url.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'video/mp2t'});res.end(body);return;
  }
  if(req.url.startsWith('/media')){res.writeHead(200,{'Content-Type':'video/mp4'});res.end('observed-media');}
  else{res.writeHead(200,{'Content-Type':'text/html','Set-Cookie':'capture_test=existing; HttpOnly; SameSite=Lax'});res.end('<title>Public media fixture</title><script>fetch("/media?version="+Date.now())</script>');}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const local=`http://127.0.0.1:${server.address().port}`;await page.goto(local);
 const waitFor=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,100));}throw new Error('Media discovery timed out');};
 await waitFor(()=>capture.snapshot().pages[0]?.candidates.length);
 let state=capture.snapshot().pages[0],candidate=capture.select(state.id,state.recommendedId);assert.equal(candidate.cookies,'capture_test=existing');assert.ok(candidate.headers['user-agent']);assert.equal(candidate.referer,local+'/');
 const old=candidate.id;await capture.refresh(state.id,true);await waitFor(()=>capture.snapshot().pages[0]?.candidates.length);state=capture.snapshot().pages[0];assert.notEqual(state.recommendedId,old);
 console.log('PASS: real browser request headers, HttpOnly session cookie, MIME detection, refresh and URL rotation');
 // The public hls.js demo plays the public Mux Big Buck Bunny HLS stream.
 const stream='https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
 await page.goto('https://hlsjs.video-dev.org/demo/?src='+encodeURIComponent(stream),{waitUntil:'domcontentloaded',timeout:60000});
 await waitFor(()=>capture.snapshot().pages[0]?.candidates.some(c=>c.kind==='HLS'&&c.recordable));
 state=capture.snapshot().pages[0];candidate=capture.select(state.id,state.recommendedId);
 await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/capture-public-demo.png'});
 const output=path.resolve('artifacts/capture-public-hls.mp4');
 await runProcess(FFMPEG,['-y','-v','error',...inputArgs(candidate.url),...captureInputArgs(candidate),'-i',candidate.url,'-t','5','-c','copy',output],{timeout:90000});
 const metadata=await probe(output);assert.ok(Number(metadata.format.duration)>=4);assert.ok(metadata.streams.some(s=>s.codec_type==='video'));
 console.log('PASS: public hls.js page → observed HLS → ffmpeg → playable 5-second MP4');
 const fixtureDir=path.resolve('artifacts/capture-fixture');await fs.mkdir(fixtureDir,{recursive:true});
 await runProcess(FFMPEG,['-y','-v','error','-i',output,'-c','copy','-f','hls','-hls_time','2','-hls_list_size','0','-hls_segment_filename',path.join(fixtureDir,'part%d.ts'),path.join(fixtureDir,'index.m3u8')]);
 for(const name of await fs.readdir(fixtureDir))securedFiles.set('/secured/'+name,await fs.readFile(path.join(fixtureDir,name)));
 assert.equal((await fetch(local+'/secured/index.m3u8')).status,403);
 await page.goto(local);await page.evaluate(()=>fetch('/secured/index.m3u8'));
 await waitFor(()=>capture.snapshot().pages[0]?.candidates.some(c=>c.kind==='HLS'));
 state=capture.snapshot().pages[0];candidate=capture.select(state.id,state.recommendedId);
 const securedOutput=path.resolve('artifacts/capture-session-hls.mp4');
 await runProcess(FFMPEG,['-y','-v','error',...inputArgs(candidate.url),...captureInputArgs(candidate),'-i',candidate.url,'-t','4','-c','copy',securedOutput]);
 assert.ok(Number((await probe(securedOutput)).format.duration)>=3);
 console.log('PASS: server rejects missing session; ffmpeg replays observed Cookie, Referer and User-Agent for playlist AND segments');
}finally{await browser.close();if(server)await new Promise(r=>server.close(r));}
