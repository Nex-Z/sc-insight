import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();let submitted;
 await page.route('**/api/recording-target/resolve',route=>route.fulfill({json:{name:'PublicFixture',source_id:'123',status:'unsupported_manifest',reason:'测试：自定义分片地址尚未支持'}}));
 await page.route('**/api/recordings/by-target',route=>{submitted=route.request().postDataJSON();return route.fulfill({json:{model_id:123,status:'等待上线',auto_record:true}});});
 await page.goto('http://127.0.0.1:3010/#recordings');
 const panel=page.locator('.model-recording');
 await panel.getByLabel('主播名称 / 平台 ID').fill('123');
 await panel.getByRole('button',{name:'检查直播源'}).click();
 await expect(panel.getByRole('status')).toContainText('自定义分片地址尚未支持');
 await panel.getByLabel('每段最长时长（秒）').fill('60');
 await panel.getByLabel('上线自动录制').check();
 await panel.getByRole('button',{name:'启用上线自动录制'}).click();
 await expect(panel.getByRole('status')).toContainText('已启用上线自动录制');
 expect(submitted).toEqual({target:'123',max_seconds:60,auto_record:true,until_offline:true});
 await expect(panel.getByLabel('每段最长时长（秒）')).toHaveCount(0);
 await panel.getByLabel('不分段，录到下线').uncheck();
 await expect(panel.getByLabel('每段最长时长（秒）')).toBeVisible();
 await panel.getByRole('button',{name:'启用上线自动录制'}).click();
 await expect.poll(()=>submitted?.until_offline).toBe(false);
 await page.setViewportSize({width:390,height:844});
 expect(await panel.evaluate(e=>e.getBoundingClientRect().right)).toBeLessThanOrEqual(390);
 await page.screenshot({path:'artifacts/model-recording-mobile.png',fullPage:true});
 console.log('PASS: name/ID entry, preview reason, duration, queue submission and mobile layout; recording API mocked');
}finally{await browser.close();}
