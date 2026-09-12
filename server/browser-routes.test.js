import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import {createBrowserRoutes} from './browser-routes.js';
import {pool} from './db.js';

test('local API rejects cross-site requests and passes selected capture to RecorderCore',async()=>{
 const candidate={url:'https://example.org/master.m3u8',headers:{cookie:'existing=1'}};let received;
 const capture={snapshot:()=>({connected:true,pages:[]}),select:(page,id)=>{assert.equal(page,'page');assert.equal(id,'media');return candidate;}};
 const app=express();app.use(express.json());app.use('/capture',createBrowserRoutes(capture,async(c,seconds)=>{received={c,seconds};return {id:123};}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/capture`;
 try{
  let response=await fetch(url,{headers:{Origin:'https://unrelated.example'}});assert.equal(response.status,403);
  const status=await new Promise((resolve,reject)=>{http.get(url,{headers:{Host:'unrelated.example'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});assert.equal(status,403);
  response=await fetch(url);assert.equal(response.headers.get('cache-control'),'no-store');
  response=await fetch(url+'/record',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageId:'page',candidateId:'media',max_seconds:5})});assert.equal(response.status,200);assert.equal(received.c,candidate);assert.equal(received.seconds,5);
 }finally{await new Promise(r=>server.close(r));}
});
test.after(()=>pool.end());
