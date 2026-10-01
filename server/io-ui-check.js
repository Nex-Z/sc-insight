import assert from 'node:assert/strict';
import express from 'express';
import {chromium} from '@playwright/test';

const app=express();app.use(express.static('dist'));
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.clock.install();
 let states=0,charts=0,held,release;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const state={models:[],rules:[],recordings:[],events:[],collector:null,unread:0,polling:{trackedSeconds:30,generalSeconds:600,tracked:{running:false}},worker:{ready:true},scope:'test'};
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());let body={};
  if(url.pathname==='/api/state'){states++;assert.equal(url.searchParams.get('charts'),'0');if(held)await new Promise(resolve=>{release=resolve;});body=state;}
  else if(url.pathname==='/api/dashboard'){charts++;body={history:[{time:new Date().toISOString(),value:30}],heatmap:[{day:1,hour:0,value:30}]};}
  else if(url.pathname==='/api/storage')body={directory:'/fixture'};
  else body={items:[],total:0,unread:0};
  await route.fulfill({json:body});
 });
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByText('采样在线主播',{exact:true}).waitFor({timeout:10000}).catch(e=>{console.log(errors);throw e;});await page.waitForFunction(()=>document.querySelector('.chart-caption'));
 assert.equal(charts,1);
 held=true;await page.clock.fastForward(30000);await page.waitForTimeout(50);const before=states;
 await page.clock.fastForward(60000);await page.waitForTimeout(50);assert.equal(states,before,'state requests must not overlap');
 held=false;release();await page.waitForTimeout(50);
 await page.evaluate(()=>{window.__hidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__hidden});document.dispatchEvent(new Event('visibilitychange'));});
 const hiddenStates=states;await page.clock.fastForward(180000);await page.waitForTimeout(50);assert.equal(states,hiddenStates);assert.equal(charts,1);
 await page.evaluate(()=>{window.__hidden=false;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(100);assert.equal(charts,2);
 await page.evaluate(()=>{location.hash='#models';});await page.waitForTimeout(50);await page.clock.fastForward(180000);await page.waitForTimeout(100);assert.equal(charts,2,'other pages must not load charts');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,states,charts,checks:['no overlap','hidden tab pauses','charts expire','charts only on dashboard']}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
