import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3010/#discover');
 await page.getByLabel('官网用户名搜索').fill('xinxin-1010');await page.getByRole('button',{name:'搜索官网',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('官网用户名搜索',{timeout:25000});
 let session;page.on('response',async r=>{if(r.url().endsWith('/api/live')&&r.request().method()==='POST')session=await r.json();});
 await page.locator('.model-card').filter({hasText:'xinxin-1010'}).getByRole('button',{name:'看直播',exact:true}).click();
 await expect(page).toHaveURL(/#live\/\d+$/);await expect(page.getByRole('dialog')).toHaveCount(0);const dialog=page.locator('.live-room');await expect(dialog).toContainText('直播播放中',{timeout:60000});
 await expect.poll(()=>dialog.locator('video').evaluate(v=>v.currentTime),{timeout:30000}).toBeGreaterThan(2);
 await expect(dialog).toContainText('实时聊天已连接',{timeout:20000});
 await dialog.locator('video').evaluate(v=>v.pause());
 await page.waitForTimeout(12000);
 expect(await dialog.locator('video').evaluate(v=>v.paused)).toBe(true);
 await dialog.locator('video').evaluate(v=>v.play());
 await page.screenshot({path:'artifacts/live-player.png'});
 await page.locator('.live-room-nav').getByRole('button',{name:'发现主播'}).click();
 await expect.poll(async()=>{if(!session?.url)return 0;return (await page.request.get('http://127.0.0.1:3010'+session.url)).status();}).toBe(404);
 expect(errors).toEqual([]);console.log('PASS: real HTTP live video plays, public chat subscribes, closing releases session');
}finally{await browser.close();}
