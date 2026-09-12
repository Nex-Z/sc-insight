import {chromium,expect} from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs/promises';
const base=process.env.CAPTURE_APP_URL||'http://127.0.0.1:3010';
const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const browser=await chromium.launch({channel:process.env.CAPTURE_TEST_BROWSER||'msedge',headless:true,args:[`--remote-debugging-port=${port}`]});
let connected=false;
try {
 const context=await browser.newContext();const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/#recordings');
 await expect(page.getByRole('heading',{name:'Browser Media Capture'})).toBeVisible();
 await page.getByLabel('本机 CDP 地址').fill(`http://127.0.0.1:${port}`);
 await page.getByRole('button',{name:'连接 / 打开浏览器'}).click();
 await expect(page.getByRole('button',{name:'断开监听'})).toBeEnabled({timeout:15000});connected=true;
 const media=await context.newPage();
 await media.goto('https://hlsjs.video-dev.org/demo/?src='+encodeURIComponent('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'),{waitUntil:'domcontentloaded',timeout:60000});
 await expect.poll(async()=>{const s=await (await page.request.get(base+'/api/browser-capture')).json();return s.pages.find(p=>p.url.startsWith('https://hlsjs.video-dev.org'))?.recommendedId;},{timeout:30000}).toBeTruthy();
 const state=await (await page.request.get(base+'/api/browser-capture')).json();
 await page.getByLabel('监听页面').selectOption(state.pages.find(p=>p.url.startsWith('https://hlsjs.video-dev.org')).id);
 await page.getByRole('button',{name:'选择推荐流'}).click();await page.getByLabel('录制秒数').fill('5');
 await page.getByRole('button',{name:'录制所选媒体'}).click();
 await expect(page.getByRole('status').filter({hasText:/录制任务 #\d+ 已加入队列/})).toBeVisible();
 const message=await page.getByRole('status').filter({hasText:/录制任务 #/}).innerText();const id=Number(message.match(/#(\d+)/)[1]);
 await expect.poll(async()=>{const s=await (await page.request.get(base+'/api/state')).json();return s.recordings.find(r=>r.id===id)?.status;},{timeout:90000,intervals:[2000]}).toBe('已完成');
 await page.reload();await expect(page.locator('.capture-job').filter({hasText:'已完成'}).first()).toBeVisible();
 await page.getByLabel('监听页面').selectOption(state.pages.find(p=>p.url.startsWith('https://hlsjs.video-dev.org')).id);
 const file=await page.request.get(base+`/api/recordings/${id}/file`);expect(file.ok()).toBeTruthy();expect(Number(file.headers()['content-length'])).toBeGreaterThan(1000);
 await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/capture-ui-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/capture-ui-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();expect(errors).toEqual([]);
 console.log(`PASS: UI → CDP → public HLS selection → RecorderCore job #${id} → completed MP4 / playback endpoint; desktop and mobile`);
} finally {
 if(connected)await fetch(base+'/api/browser-capture/disconnect',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 await browser.close();
}
