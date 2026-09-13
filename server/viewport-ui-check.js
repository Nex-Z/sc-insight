import express from 'express';
import {chromium,expect} from '@playwright/test';
const app=express();app.use(express.static('dist'));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const models=Array.from({length:140},(_,i)=>({id:i+1,name:'Fixture'+String(i).padStart(3,'0'),source_id:String(i+1),favorite:true,online:true,fresh:true,viewers:1000-i,country:'US',room_status:'public'}));let concurrency=2;
 await page.route('**/api/**',async route=>{const p=new URL(route.request().url()).pathname;let data={};
  if(p==='/api/state')data={models,recordings:[],rules:[],events:[],history:[],heatmap:[]};
  else if(p==='/api/models/search')data={models,total:models.length};
  else if(p==='/api/highlights/capacity'){if(route.request().method()==='PUT')concurrency=route.request().postDataJSON().concurrency;data={concurrency,active:2,waiting:3};}
  else if(p==='/api/polling')data={trackedSeconds:30,generalSeconds:600};
  else if(p==='/api/storage')data={directory:'/tmp/recordings'};
  await route.fulfill({json:data});
 });
 const base='http://127.0.0.1:'+server.address().port;
 await page.goto(base+'/#models');await page.locator('.model-grid').scrollIntoViewIfNeeded();await expect.poll(()=>page.locator('.model-card').count()).toBeGreaterThan(3);
 const first=await page.locator('.model-card').count();expect(first).toBeLessThan(140);await expect(page.getByRole('button',{name:'下一页',exact:true})).toHaveCount(0);
 await page.setViewportSize({width:1440,height:1600});await expect.poll(()=>page.locator('.model-card').count()).toBeGreaterThan(first);
 for(let i=0;i<50&&await page.locator('.model-card').count()<140;i++){const count=await page.locator('.model-card').count();await page.locator('.directory-load-status').scrollIntoViewIfNeeded();await expect.poll(()=>page.locator('.model-card').count()).toBeGreaterThan(count);}
 await expect(page.locator('.model-card')).toHaveCount(140);expect(await page.locator('.model-card').evaluateAll(nodes=>new Set(nodes.map(n=>n.textContent)).size)).toBe(140);
 await page.getByLabel('搜索我的关注').fill('Fixture139');await expect(page.locator('.model-card')).toHaveCount(1);await expect(page.locator('.model-card')).toContainText('Fixture139');
 await page.getByRole('button',{name:'去发现主播'}).click();await page.getByLabel('官网用户名搜索').fill('Fixture');await page.getByRole('button',{name:'搜索官网',exact:true}).click();await page.locator('.model-grid').scrollIntoViewIfNeeded();await expect.poll(()=>page.locator('.model-card').count()).toBeGreaterThan(3);expect(await page.locator('.model-card').count()).toBeLessThan(140);
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/#models');await page.locator('.model-grid').scrollIntoViewIfNeeded();await expect.poll(()=>page.locator('.model-card').count()).toBeGreaterThan(1);expect(await page.locator('.model-card').count()).toBeLessThan(first);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'artifacts/viewport-mobile.png',fullPage:true});
 await page.goto(base+'/#settings');await expect(page.getByLabel('高光并发数')).toHaveValue('2');await page.getByLabel('高光并发数').fill('8');await page.getByRole('button',{name:'保存高光容量'}).click();await expect(page.getByText('当前占用 2 / 8 路 · 3 位主播等待')).toBeVisible();await page.reload();await expect(page.getByLabel('高光并发数')).toHaveValue('8');expect(errors).toEqual([]);
 console.log('PASS viewport-sized batches, tall resize, all 140 unique cards, filter reset, discovery, mobile, capacity save/reload; no page errors');
}finally{await browser.close();await new Promise(r=>server.close(r));}
