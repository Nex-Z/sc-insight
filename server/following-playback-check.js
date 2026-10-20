import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {FFMPEG,runProcess} from './media.js';
import {playbackFile,mp4NeedsIndex} from './playback-file.js';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'sc-playback-check-'));
const file=path.join(root,'large.mp4');let browser,server;
try{
 await runProcess(FFMPEG,['-v','error','-n','-stream_loop','16','-i',path.resolve('artifacts/highlight-fixture.mp4'),'-c','copy','-movflags','+frag_keyframe+empty_moov+default_base_moof',file],{timeout:120000});
 const stat=await fs.stat(file);assert.ok(stat.size>100*1024**2);assert.ok(await mp4NeedsIndex(file));
 const before=Date.now();const [optimized,shared]=await Promise.all([playbackFile(file),playbackFile(file)]);assert.equal(optimized,shared);assert.equal(await mp4NeedsIndex(optimized),false);const prepareMs=Date.now()-before;
 assert.equal((await fs.stat(file)).size,stat.size);
 const app=express();app.use(express.static('dist'));app.get('/video/:kind',(req,res)=>res.sendFile(req.params.kind==='original'?file:optimized));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const range=await fetch(base+'/video/optimized',{headers:{Range:'bytes=0-1023'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,1024);
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const models=[{id:1,name:'Amber',favorite:true,content_count:128,recording_count:100,highlight_count:28,country:'CN',fresh:true,online:false},{id:2,name:'Birch',favorite:true,content_count:5,recording_count:2,highlight_count:3,country:'CN',fresh:true,online:false},{id:3,name:'Cedar',favorite:true,content_count:0,recording_count:0,highlight_count:0,country:'CN',fresh:false}];
 await page.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;return r.fulfill({json:p==='/api/state'?{models,recordings:[],rules:[],events:[],worker:{}}:p==='/api/content'?{items:[],total:0,recordingCount:0,highlightCount:0,totalPages:0}:p==='/api/storage'?{directory:'fixture'}:{}});});
 await page.goto(base+'/#models');await page.locator('.model-library').first().waitFor({timeout:5000});assert.equal(await page.locator('.model-library').count(),3);
 await page.getByLabel('排序',{exact:true}).selectOption('content');assert.match(await page.locator('.model-card').first().innerText(),/Amber/);
 await page.getByLabel('排序',{exact:true}).selectOption('contentAsc');assert.match(await page.locator('.model-card').first().innerText(),/Cedar/);
 await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/following-content-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.model-library').first().scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/following-content-mobile.png'});assert.deepEqual(errors,[]);
 let contentRequest;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/content')contentRequest=r.url();});await page.getByRole('button',{name:'查看 Amber 的内容库',exact:true}).click();await page.getByText('Amber 的内容库',{exact:true}).waitFor();await page.waitForTimeout(200);assert.equal(new URL(contentRequest).searchParams.get('model'),'1');
 await page.unroute('**/api/**');const session=await page.context().newCDPSession(page);await session.send('Network.enable');await session.send('Network.emulateNetworkConditions',{offline:false,latency:20,downloadThroughput:4*1024**2,uploadThroughput:1024**2});
 const results={bytes:stat.size,prepareMs};
 for(const kind of ['original','optimized']){
  await page.goto(base);await page.evaluate(url=>{document.body.innerHTML='';const v=document.createElement('video');v.src=url;v.muted=true;v.autoplay=true;v.controls=true;document.body.append(v);},base+'/video/'+kind);
  const start=Date.now();try{await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.1,{},{timeout:45000});results[kind+'StartMs']=Date.now()-start;}catch{results[kind+'StartMs']='>45000';}
  if(kind==='optimized'){await page.evaluate(()=>{const v=document.querySelector('video');v.currentTime=Math.max(0,v.duration-5);});await page.waitForFunction(()=>document.querySelector('video')?.readyState>=3,{},{timeout:15000});}
 }
 console.log(JSON.stringify(results));await fs.writeFile('artifacts/playback-index-check.json',JSON.stringify(results,null,2));
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});}

