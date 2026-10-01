import express from 'express';
import {chromium,expect} from '@playwright/test';
const app=express();app.use(express.static('dist'));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const viewport of [{width:3440,height:1440},{width:2560,height:1080},{width:1920,height:1080},{width:390,height:844}]){
  const page=await browser.newPage({viewport});let items=Array.from({length:25},(_,i)=>({kind:'recording',id:String(i+1),name:'滚动验收',filename:`fixture-${i}.mp4`,status:'失败',bytes:0,duration_seconds:0,created_at:new Date().toISOString(),title:`测试内容 ${i+1}`,note:'',tags:[],marks:[],favorite:false,watched:false,reasons:[]}));
  await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url());let data={};
   if(url.pathname==='/api/state')data={models:[],recordings:[],rules:[],events:[],history:[],heatmap:[]};
   else if(url.pathname==='/api/storage')data={directory:'/fixture'};
   else if(url.pathname==='/api/content'){const offset=Number(url.searchParams.get('offset')||0);data={items:items.slice(offset,offset+24),nextOffset:items.length>offset+24?offset+24:null};}
   else if(req.method()==='DELETE'){items=items.filter(m=>m.id!==url.pathname.split('/').at(-1));data={ok:true};}
   await route.fulfill({json:data});
  });
  await page.goto(`${process.env.SC_UI_BASE_URL||`http://127.0.0.1:${server.address().port}`}/#library`);await expect(page.locator('.library-row')).toHaveCount(24);
  if(viewport.width>700){
   await expect(page.getByRole('navigation',{name:'列表顶部分页'})).toBeInViewport();
   await page.mouse.move(viewport.width-80,viewport.height/2);await page.mouse.wheel(0,900);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(100);
   await expect(page.getByRole('navigation',{name:'列表顶部分页'})).toBeInViewport();
   const box=await page.getByRole('navigation',{name:'列表顶部分页'}).boundingBox();expect(box.y).toBeGreaterThanOrEqual(76);
   await page.screenshot({path:`artifacts/library-scroll-${viewport.width}.png`});
  }
  await page.getByRole('button',{name:'下一页',exact:true}).first().click();await expect(page.locator('.library-row')).toHaveCount(1);
  await page.getByRole('button',{name:'查看',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'删除当前'}).click();await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).toBe('hidden');
  await page.getByRole('button',{name:'删除当前'}).click();await page.getByRole('button',{name:'确认永久删除'}).click();await page.getByRole('button',{name:'完成',exact:true}).click();
  await expect(page.locator('dialog')).toHaveCount(0);await expect(page.locator('.library-row')).toHaveCount(24);
  console.log('after nested close',viewport,await page.evaluate(()=>({overflow:document.body.style.overflow,height:document.documentElement.scrollHeight,viewport:innerHeight})));
  await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).toBe('');
  await page.evaluate(()=>window.scrollTo(0,0));await page.mouse.move(viewport.width-80,viewport.height/2);await page.mouse.wheel(0,1000);await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(100);
  await page.locator('.library-row').last().scrollIntoViewIfNeeded();await expect(page.locator('.library-row').last()).toBeInViewport();
  await page.close();console.log(`PASS ${viewport.width}x${viewport.height}: nested modal cancellation/deletion, scroll restoration, last row reachable`);
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
