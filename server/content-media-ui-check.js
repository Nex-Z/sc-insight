import express from 'express';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const app=express();app.use(express.static('dist'));app.use('/fixture',express.static('artifacts'));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let items=['recording','highlight'].map((kind,i)=>({kind,id:String(i+1),name:'Fixture',filename:`${kind}.mp4`,status:'已完成',bytes:1000,duration_seconds:150,created_at:new Date().toISOString(),title:'',note:'',tags:[],marks:[],favorite:false,watched:false,reasons:[]}));
 let deletes=0,failNext=true;
 await page.route('**/api/**',async route=>{
  const req=route.request(),p=new URL(req.url()).pathname;let data={};
  if(p==='/api/state')data={models:[],recordings:[],rules:[],events:[],history:[],heatmap:[]};
  else if(p.endsWith('/file'))return route.continue({url:base+'/fixture/highlight-fixture.mp4'});
  else if(p==='/api/content')data={items,nextOffset:null};
  else if(p.startsWith('/api/content/')){
   const [,kind,id]=p.match(/content\/(\w+)\/(\d+)$/),item=items.find(m=>m.id===id&&m.kind===kind);
   if(req.method()==='DELETE'){
    deletes++;assert.equal(req.postDataJSON().confirm,true);
    if(failNext){failNext=false;return route.fulfill({status:409,json:{error:'测试：文件正在使用'}});}
    items=items.filter(m=>m!==item);data={ok:true};
   }else if(req.method()==='PUT'){Object.assign(item,req.postDataJSON());data=item;}else data=item;
  }
  await route.fulfill({json:data});
 });
 await page.goto(base+'/#library');await page.getByRole('button',{name:'播放',exact:true}).first().click();await page.getByRole('button',{name:'查看与整理'}).click();
 await page.getByRole('dialog').waitFor();await page.waitForFunction(()=>document.querySelector('dialog video')?.readyState>=2);
 await page.evaluate(()=>{const v=document.querySelector('dialog video');v.muted=true;return v.play();});await page.waitForFunction(()=>document.querySelector('dialog video').currentTime>.2);
 await page.getByRole('button',{name:'全屏播放'}).click();await page.waitForFunction(()=>!!document.fullscreenElement);await page.evaluate(()=>document.exitFullscreen());
 await page.getByLabel('内容标题').fill('Updated title');await page.getByRole('button',{name:'保存内容信息'}).click();await page.getByText('已保存',{exact:true}).waitFor();assert.equal(items[0].title,'Updated title');
 await page.screenshot({path:'artifacts/content-media-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('dialog').evaluate(d=>d.scrollTop=0);await page.screenshot({path:'artifacts/content-media-mobile.png'});
 assert.ok(await page.locator('dialog').evaluate(d=>d.scrollWidth<=d.clientWidth+1));
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').count(),0);assert.equal(await page.locator('video').count(),0);
 await page.getByRole('button',{name:'删除内容'}).first().click();await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal(deletes,0);
 await page.getByRole('button',{name:'删除内容'}).first().click();await page.getByRole('button',{name:'确认永久删除'}).click();await page.getByText(/测试：文件正在使用/).waitFor();assert.equal(items.length,2);await page.getByRole('button',{name:'完成',exact:true}).click();await page.getByRole('button',{name:'删除内容'}).first().click();
 await page.getByRole('button',{name:'确认永久删除'}).click();await page.getByRole('button',{name:'完成',exact:true}).click();assert.equal(items.length,1);
 await page.getByRole('button',{name:'删除内容'}).click();await page.getByRole('button',{name:'确认永久删除'}).click();await page.getByRole('button',{name:'完成',exact:true}).click();await page.getByText('没有符合条件的内容').waitFor();assert.equal(items.length,0);
 assert.deepEqual(errors,[]);console.log('PASS library popup playback/fullscreen, metadata save, Escape stop, mobile fit, cancellation, failed-delete retry, recording and highlight removal');
}finally{await browser.close();await new Promise(r=>server.close(r));}
