import express from 'express';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const app=express();app.use(express.static('dist'));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));let roomCalls=0,profileCalls=0,snapshotCalls=0;
 const model={id:1,name:'ProfileTest',source_id:1,fresh:true,online:true,favorite:true,room_status:'public',cover_url:'https://static-proxy.strpst.com/previews/fallback'};
 await page.route('**/api/**',async r=>{const p=new URL(r.request().url()).pathname;let data={};
 if(p==='/api/state')data={models:[model],recordings:[],rules:[],events:[],history:[],heatmap:[],collector:{status:'success'}};
 else if(p.endsWith('/room-info')){roomCalls++;data={live:true,goal:{description:'音乐目标',target:100,spent:roomCalls>1?70:25,percent:roomCalls>1?70:25},audience:{members:[{id:'4',name:'在线测试用户',level:20}],guests:18}};}
 else if(p.endsWith('/snapshot')){snapshotCalls++;data={url:'https://img.doppiocdn.net/thumbs/100/1'};}
 else if(p.endsWith('/public-profile')){profileCalls++;data={level:30,followers:100,rating:4.8,ratingCount:20,age:24,country:'cn',languages:['zh'],bio:'<script>window.bad=1</script>',menu:{enabled:true,items:[{activity:'点歌',price:10}]},reviews:{total:1,items:[{id:'1',author:'匿名用户',score:5,text:'测试评价',at:'2026-09-12'}]},albums:{items:[{id:'a',name:'Public',count:1,photos:[{id:'p',url:'https://static-proxy.strpst.com/photos/test'}]}]},unavailable:[],background:{url:'https://static-proxy.strpst.com/intro/test',preview:'https://static-proxy.strpst.com/intro/test',position:64}};}
 else if(p.endsWith('/broadcasts'))data={sessions:[],daily:[],quality:{},changes:[]};
 else if(p.endsWith('/engagement'))data={coverage:[],totals:{},daily:[],counts:[],states:[]};
 else if(p.endsWith('/activity'))data={daily:[{day:'2026-09-12',seconds:0,samples:0,starts:0,partial:0}],hours:Array.from({length:168},(_,i)=>({weekday:Math.floor(i/24),hour:i%24,seconds:0,starts:0,samples:0}))};
 else if(p.endsWith('/history'))data=[];
 else if(p==='/api/live')return r.fulfill({status:502,json:{error:'测试未播放媒体'}});
 await r.fulfill({json:data});
 });
 await page.route('https://img.doppiocdn.net/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#28433e"/></svg>'}));
 await page.route('https://static-proxy.strpst.com/**',r=>r.abort());
 const base=`http://127.0.0.1:${server.address().port}`;
 await page.goto(base+'/#live/1');await page.getByText('在线测试用户',{exact:false}).waitFor({timeout:10000}).catch(async e=>{console.log(errors,await page.locator('body').innerText());throw e;});await page.waitForFunction(()=>document.querySelector('video')?.poster==='https://img.doppiocdn.net/thumbs/100/1');assert.equal(await page.getByLabel('直播目标进度').getAttribute('value'),'25');await page.waitForFunction(()=>document.querySelector('progress')?.value===70,{},{timeout:20000});
 await page.goto(base+'/#detail/1');await page.getByRole('button',{name:'查看背景大图'}).waitFor();assert.equal(profileCalls,1);await page.screenshot({path:'artifacts/detail-toolbar-review.png'});const toolbar=await page.locator('.md-header-controls').boundingBox(),actions=await page.locator('.md-actions').boundingBox();assert.ok(actions.y>=toolbar.y&&actions.y+actions.height<=toolbar.y+toolbar.height+1);assert.equal(await page.getByRole('tab',{name:'统计数据',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await page.locator('#model-panel-profile').isVisible(),false);await page.getByRole('tab',{name:'官网资料',exact:true}).click();await page.getByText('测试评价',{exact:true}).waitFor();assert.equal(profileCalls,1);await page.getByRole('button',{name:'查看相册大图'}).click();await page.getByRole('dialog',{name:'图片大图'}).waitFor();await page.getByRole('button',{name:'放大图片'}).click();assert.equal(await page.getByRole('button',{name:'重置图片缩放'}).innerText(),'125%');await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.locator('.public-tip-menu').innerText(),'点歌\n10');assert.equal(await page.locator('.public-photo-grid img').count(),1);assert.equal(await page.evaluate(()=>window.bad),undefined);assert.ok(await page.locator('.public-profile-summary').innerText().then(t=>t.includes('Lv.30')));
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.goto(base+'/#models');await page.waitForFunction(()=>!!document.querySelector('img[alt*=直播抓帧]'));assert.ok(snapshotCalls>0);assert.deepEqual(errors,[]);console.log('PASS goal refresh, online member rank, profile/menu/reviews/albums, escaped bio and mobile width');
}finally{await browser.close();await new Promise(r=>server.close(r));}
