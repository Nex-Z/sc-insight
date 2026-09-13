import assert from 'node:assert/strict';
import {pool} from './db.js';
import {recordBroadcast} from './broadcast-history.js';
import {classifyRoom} from '../src/room-state.js';
const db=await pool.connect();
try{
 await db.query('BEGIN');
 const {rows:[m]}=await db.query("INSERT INTO models(name,country,language,color) VALUES($1,'test','test','#888') RETURNING id",['room_state_fixture_'+Date.now()]);
 const points=[['public',100],['public',100],['groupShow',null],['groupShow',null],['p2p',null],['p2p',null],['idle',null],['public',200],['public',200],['off',0]];
 const start=Date.now()-60000;
 for(let i=0;i<points.length;i++){
  const [status,viewers]=points[i],room=classifyRoom({id:1,status},{isCamAvailable:status==='public',show:status==='groupShow'?{id:5,modelId:1,mode:'groupShow',details:{groupShow:{type:'ticket'}}}:null});
  await recordBroadcast(db,m.id,{online:room.online,room_status:room.status,room_details:room,viewers},5,new Date(start+i*5000));
  if(status==='idle'){const s=(await db.query('SELECT ended_at FROM broadcast_sessions WHERE model_id=$1',[m.id])).rows[0];assert.equal(s.ended_at,null);}
 }
 const {rows:[s]}=await db.query('SELECT *,viewer_sum/nullif(viewer_samples,0) AS average FROM broadcast_sessions WHERE model_id=$1',[m.id]);
 assert.equal(s.end_reason,'offline_observed');assert.equal(s.end_known,true);assert.equal(s.incomplete,true);assert.equal(s.average,150);assert.equal(s.viewer_samples,4);assert.equal(s.observed_seconds,30);
 const count=await db.query('SELECT count(*)::int AS n FROM broadcast_sessions WHERE model_id=$1',[m.id]);assert.equal(count.rows[0].n,1);
 const typed=await db.query("SELECT sum(extract(epoch FROM ended_at-started_at))::int AS seconds FROM broadcast_intervals WHERE model_id=$1 AND room_status='ticketShow'",[m.id]);assert.equal(typed.rows[0].seconds,5);
 const proofs=await db.query("SELECT room_details FROM broadcast_observations WHERE model_id=$1 AND room_status='ticketShow'",[m.id]);assert.equal(proofs.rows[0].room_details.show_type,'ticket');
 console.log('PASS public -> ticket -> private -> idle -> public -> offline stays one session; ticket interval, evidence, missing viewer statistics and confirmed offline verified');
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
