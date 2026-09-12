import {chromium,expect} from '@playwright/test';
const b=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await b.newPage();const state=await(await fetch('http://127.0.0.1:3010/api/state')).json();
 const first={...state.models[0],id:900001,name:'FollowedFixture',source_id:'900001',favorite:true,online:true,fresh:true,viewers:321};
 const second={...first,id:900002,name:'SearchFixture',source_id:'900002',favorite:false};state.models=[first,second];let searches=0;
 await page.route('**/api/state',r=>r.fulfill({json:state}));
 await page.route('**/api/models/search',r=>{searches++;return r.fulfill({json:{models:[second],total:1}});});
 await page.route('**/api/models/900002',r=>{second.favorite=r.request().postDataJSON().favorite;return r.fulfill({json:second});});
 await page.goto('http://127.0.0.1:3010/#models');await expect(page.locator('.model-card')).toHaveCount(1);await expect(page.locator('.model-card')).toContainText('FollowedFixture');expect(searches).toBe(0);
 await page.getByRole('button',{name:'去发现主播'}).click();await page.getByLabel('官网用户名搜索').fill('Search');await page.getByLabel('在线状态',{exact:true}).selectOption('online');await page.waitForTimeout(700);expect(searches).toBe(0);
 await page.getByRole('button',{name:'搜索官网',exact:true}).click();await expect(page.locator('.model-card')).toHaveCount(1);expect(searches).toBe(1);
 await page.getByLabel('在线状态',{exact:true}).selectOption('offline');await page.waitForTimeout(500);expect(searches).toBe(1);await expect(page.locator('.model-card')).toHaveCount(1);
 await page.locator('.model-card').getByRole('button',{name:'关注',exact:true}).click();await expect(page.locator('.model-card')).toContainText('已关注');
 await page.getByRole('button',{name:'Following 我的关注',exact:true}).click();await expect(page.locator('.model-card')).toHaveCount(2);expect(searches).toBe(1);
 await page.locator('.model-card').filter({hasText:'SearchFixture'}).getByRole('button',{name:'已关注',exact:true}).click();await expect(page.locator('.model-card')).toHaveCount(1);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 console.log('PASS: explicit official search, draft filters, following-only list, follow/unfollow and mobile layout');
}finally{await b.close();}
