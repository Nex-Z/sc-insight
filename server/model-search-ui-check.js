import express from 'express';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {modelSearchRoutes} from './model-search-routes.js';
import {pool} from './db.js';
const app=express();app.use(express.json());app.use('/api',modelSearchRoutes);
app.get('/api/{*path}',async(req,res)=>{const r=await fetch('http://127.0.0.1:3010'+req.originalUrl);res.status(r.status).json(await r.json());});
app.use(express.static(path.resolve('dist')));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
let browser;
try{
 const base=`http://127.0.0.1:${server.address().port}`;
 const response=await fetch(base+'/api/models/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'xinxin-1010'})});
 const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.ok(result.models.some(m=>m.name==='xinxin-1010'&&m.id));
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/#models');
 const field=page.locator('input[placeholder*="搜索"]').first();await field.fill('xinxin-1010');
 await expect(page.getByRole('status')).toContainText('官网用户名搜索',{timeout:25000});
 await expect(page.locator('.model-card')).toHaveCount(Math.min(6,result.models.length));
 await page.locator('.model-card').filter({hasText:'xinxin-1010'}).getByRole('button',{name:'详情'}).click();
 await expect(page).toHaveURL(/#detail\//);await expect(page.locator('body')).toContainText('xinxin-1010');assert.deepEqual(errors,[]);
 console.log('PASS: live official HTTP search, persisted identity, UI search and details');
}finally{await browser?.close();await new Promise(r=>server.close(r));await pool.end();}
