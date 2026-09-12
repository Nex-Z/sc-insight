import express from 'express';
import assert from 'node:assert/strict';
import {broadcastRoutes} from './broadcast-routes.js';
import {pool} from './db.js';
const app=express();app.use(broadcastRoutes);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
try{
 const base=`http://127.0.0.1:${server.address().port}`;
 const empty=await(await fetch(base+'/models/2147483647/broadcasts')).json();assert.equal(empty.daily.length,30);assert.ok(empty.daily.every(d=>d.observed_seconds===0&&d.weighted_viewers===null));
 const data=await(await fetch(base+'/models/152141/broadcasts')).json();assert.ok(data.sessions.length);const total=data.daily.reduce((n,d)=>n+d.observed_seconds,0),sessionTotal=data.sessions.reduce((n,s)=>n+s.observed_seconds,0);assert.ok(Math.abs(total-sessionTotal)<.01);assert.ok(data.daily.every(d=>d.observed_seconds>=0&&d.observed_seconds<=86400));
 console.log('PASS: empty dates are zero, daily covered time matches persisted sessions',total);
}finally{await new Promise(r=>server.close(r));await pool.end();}
