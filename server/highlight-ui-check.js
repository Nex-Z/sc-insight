import express from 'express';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {highlightDefaults} from './highlight-detection.js';
const app=express();app.use(express.static('dist'));app.use('/fixture',express.static('artifacts'));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});let enabled=false,config={...highlightDefaults};
 const item={id:'1',triggered_at:new Date().toISOString(),started_at:new Date(Date.now()-120000).toISOString(),reasons:[{kind:'viewers',text:'人数 180 → 310'},{kind:'tips',text:'30 秒内 800 TK'}],status:'已完成',duration_seconds:150,bytes:1000};
 const model={id:1,name:'HighlightTest',source_id:'1',fresh:true,online:true,favorite:true,room_status:'public'};
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url()),p=url.pathname;let data={};
  if(p==='/api/state')data={models:[model],recordings:[],rules:[],events:[],history:[],heatmap:[]};
  else if(p==='/api/highlights/1/file')return route.continue({url:`http://127.0.0.1:${server.address().port}/fixture/highlight-fixture.mp4`});
  else if(p.endsWith('/highlights')){if(route.request().method()==='PUT'){const body=route.request().postDataJSON();enabled=body.enabled;config=body.config;data={ok:true,enabled,config};}else data={enabled,config,state:{status:'监测中 · 已缓存'},items:url.search?'':enabled?[item]:[],nextBefore:null};}
  else if(p.endsWith('/broadcasts'))data={sessions:[],daily:[],quality:{},changes:[]};
  else if(p.endsWith('/engagement'))data={coverage:[],totals:{},daily:[],counts:[],states:[]};
  else if(p.endsWith('/public-profile'))data={menu:{items:[]},reviews:{items:[]},albums:{items:[]},languages:[],unavailable:[]};
  else if(p.endsWith('/activity'))data={daily:[{day:'2026-09-13',seconds:0,samples:0,starts:0,partial:0}],hours:Array.from({length:168},(_,i)=>({weekday:Math.floor(i/24),hour:i%24,seconds:0,starts:0,samples:0}))};
  else if(p.endsWith('/history'))data=[];
  await route.fulfill({json:data});
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/#detail/1`);await page.getByRole('tab',{name:'高光时刻',exact:true}).click();await page.getByText('尚无高光片段。',{exact:false}).waitFor();
 await page.getByRole('checkbox',{name:'高光录制'}).click();await page.getByRole('button',{name:'播放高光'}).waitFor();assert.equal(enabled,true);
 await page.getByRole('checkbox',{name:'目标即将完成提醒',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.goal-controls input')?.checked);assert.equal(config.goalNotify,true);
 assert.equal(await page.getByLabel('人数增幅（%）').count(),0);
 await page.getByRole('checkbox',{name:'人数变多',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('input[aria-label="人数变多"]').checked);assert.equal(config.viewerRecord,false);assert.equal(config.tipRecord,true);
 await page.getByRole('button',{name:'高级设置'}).click();assert.equal(await page.getByLabel('人数增幅（%）').inputValue(),'30');await page.getByLabel('人数增幅（%）').fill('45');await page.getByLabel('人数至少增加').fill('75');await page.getByLabel('目标剩余比例（%）').fill('2');await page.getByRole('button',{name:'保存设置',exact:true}).click();await page.getByRole('button',{name:'高级设置'}).waitFor();assert.equal(config.viewerRatio,.45);assert.equal(config.viewerIncrease,75);assert.equal(config.goalNearPercent,2);
 await page.getByRole('button',{name:'播放高光'}).click();await page.waitForFunction(()=>document.querySelector('.highlight-player video')?.readyState>=2);await page.evaluate(()=>{const v=document.querySelector('.highlight-player video');v.muted=true;return v.play();});await page.waitForFunction(()=>document.querySelector('.highlight-player video').currentTime>0.2);
 await page.getByRole('button',{name:'关闭播放'}).click();await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/highlights-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().width<=59);await page.screenshot({path:'artifacts/highlights-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.getByRole('checkbox',{name:'高光录制'}).click();await page.getByText('已关闭',{exact:true}).waitFor();assert.equal(enabled,false);assert.deepEqual(errors,[]);console.log('PASS detail tab, empty state, enable, settings save, actual video playback, disable, mobile width; no JS errors');
}finally{await browser.close();await new Promise(r=>server.close(r));}
