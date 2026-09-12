import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage();let events=[{id:100,title:'历史提醒',detail:'旧事件',created_at:new Date().toISOString()}];
await page.addInitScript(()=>{window.sent=[];class MockNotification{static permission=localStorage.getItem('test-permission')||'default';static async requestPermission(){this.permission='granted';localStorage.setItem('test-permission','granted');return 'granted';}constructor(title,options){window.sent.push({title,options});}close(){}}window.Notification=MockNotification;});
await page.route('**/api/state',async route=>{const response=await route.fetch();const s=await response.json();s.events=events;s.polling.trackedSeconds=1;await route.fulfill({json:s});});
await page.goto('http://127.0.0.1:3010/#models');await page.waitForFunction(()=>document.querySelector('.bell b')?.textContent==='1');await page.getByRole('button',{name:'提醒通知',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.bell b'));await page.getByRole('button',{name:'开启通知',exact:true}).click();assert.equal(await page.evaluate(()=>sent.length),0);
await page.getByRole('button',{name:'Following 我的关注',exact:true}).click();events=[{id:101,title:'新录制完成',detail:'测试事件',created_at:new Date().toISOString()},...events];await page.waitForFunction(()=>window.sent.length===1);assert.equal(await page.locator('.bell b').textContent(),'1');await page.waitForTimeout(1500);assert.equal(await page.evaluate(()=>sent.length),1);
await page.getByRole('button',{name:'提醒通知',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.bell b'));await page.reload();await page.getByRole('button',{name:'关闭通知',exact:true}).waitFor();assert.equal(await page.locator('.bell b').count(),0);console.log('PASS unread count, visit/read persistence, opt-in permission, no historical flood, new-event delivery and deduplication');
}finally{for(const context of browser.contexts()){for(const page of context.pages())await page.unrouteAll({behavior:'wait'});}await browser.close();}


