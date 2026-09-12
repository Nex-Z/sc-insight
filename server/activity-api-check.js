import express from 'express';
import assert from 'node:assert/strict';
import {broadcastRoutes} from './broadcast-routes.js';
import {pool} from './db.js';
const app=express();app.use(broadcastRoutes);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
try{const base=`http://127.0.0.1:${server.address().port}`;const r=await fetch(base+'/models/152141/activity');const a=await r.json();assert.equal(r.status,200);assert.equal(a.daily.length,365);assert.equal(a.hours.length,168);assert.ok(a.daily.every(d=>d.seconds>=0&&d.seconds<=86400));const empty=await(await fetch(base+'/models/2147483647/activity')).json();assert.ok(empty.daily.every(d=>d.seconds===0&&d.samples===0));console.log('PASS activity SQL and empty model',a.daily.at(-1));}finally{await new Promise(r=>server.close(r));await pool.end();}
