import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3010/#detail/152141');
 await page.locator('.activity-calendar button').last().waitFor();
 assert.equal(await page.locator('.activity-calendar button').count(),365);
 assert.equal(await page.locator('.activity-hours button').count(),168);
 await page.getByRole('switch',{name:'上线自动录制'}).waitFor();
 await page.screenshot({path:'artifacts/model-activity-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844}); await page.emulateMedia({reducedMotion:'reduce'}); await page.waitForTimeout(300);
 await page.screenshot({path:'artifacts/model-activity-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 console.log('PASS read-only activity page, calendar cells, recording control, mobile overflow');
}finally{await browser.close();}

