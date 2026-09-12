import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();let next=false,submitted;
 const make=(id,url,extra={})=>({id,pageId:'test',url,kind:'HLS',method:'GET',status:200,score:100,recordable:true,lastSeen:Number(id)||0,count:1,headerNames:[],contentType:'application/vnd.apple.mpegurl',...extra});
 await page.route('**/api/browser-capture**',async route=>{
  if(route.request().url().endsWith('/record')){submitted=route.request().postDataJSON();return route.fulfill({json:{id:999}});}
  const candidates=[make('master','https://example.org/master.m3u8',{master:true,score:120}),...Array.from({length:next?41:40},(_,i)=>make(String(i+1),`https://example.org/live.m3u8?token=existing&_HLS_msn=${i}&_HLS_part=1`)),make('segment','https://example.org/part.mp4',{kind:'video',score:75})];
  return route.fulfill({json:{connected:true,pages:[{id:'test',title:'Public LL-HLS fixture',url:'https://example.org/',recommendedId:'master',candidates}]}});
 });
 await page.goto('http://127.0.0.1:3010/#recordings');
 await expect(page.locator('.capture-table tbody tr')).toHaveCount(2);
 await expect(page.getByText('发现 2 组播放清单 · 42 条请求')).toBeVisible();
 await page.locator('.capture-table tbody tr').nth(1).getByRole('radio').check();next=true;
 await expect(page.getByText('发现 2 组播放清单 · 43 条请求')).toBeVisible({timeout:8000});
 await expect(page.locator('.capture-table tbody tr').nth(1).getByRole('radio')).toBeChecked();
 await page.getByRole('button',{name:'录制所选媒体'}).click();
 await expect.poll(()=>submitted?.candidateId).toBe('41');
 await page.getByLabel('显示全部原始请求').check();await expect(page.locator('.capture-table tbody tr')).toHaveCount(43);
 console.log('PASS: 42 requests → 2 playlists; stable selection follows newest actual request; raw requests remain available; recording mocked');
}finally{await browser.close();}
