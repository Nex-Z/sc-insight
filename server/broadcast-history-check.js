import assert from 'node:assert/strict';
import {pool} from './db.js';
import {recordBroadcast} from './broadcast-history.js';
const db=await pool.connect();
try{
 await db.query('BEGIN');const {rows:[model]}=await db.query("INSERT INTO models(name,country,language,color) VALUES($1,'未知','未知','#000') RETURNING id",['HistoryFixture_'+Date.now()]);
 const observe=(seconds,online,viewers)=>recordBroadcast(db,model.id,{online,viewers,room_status:online?'public':'offline'},5,new Date(Date.UTC(2026,8,12,0,0,seconds)));
 await observe(0,false,0);await observe(5,true,100);await observe(10,true,200);await observe(15,false,0);
 let rows=(await db.query('SELECT * FROM broadcast_sessions WHERE model_id=$1 ORDER BY id',[model.id])).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].start_known,true);assert.equal(rows[0].end_known,true);assert.equal(rows[0].observed_seconds,5);assert.equal(rows[0].peak_viewers,200);assert.equal(rows[0].incomplete,false);
 await observe(20,true,50);await observe(100,true,80);
 rows=(await db.query('SELECT * FROM broadcast_sessions WHERE model_id=$1 ORDER BY id',[model.id])).rows;
 assert.equal(rows.length,3);assert.equal(rows[1].end_reason,'observation_gap');assert.equal(rows[2].start_known,false);assert.equal(rows[2].observed_seconds,0);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM broadcast_intervals WHERE model_id=$1',[model.id])).rows[0].n,1);
 console.log('PASS: real DB session boundaries, viewer stats, gap splitting; fixtures rolled back');
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
