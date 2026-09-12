import assert from 'node:assert/strict';
import {pool} from './db.js';
import {saveChatMessage} from './chat-monitor.js';
const db=await pool.connect();
try{
 await db.query('BEGIN');const model=(await db.query("INSERT INTO models(name,country,language,color) VALUES($1,'未知','未知','#000') RETURNING id",['ChatFixture_'+Date.now()])).rows[0];
 const session=(await db.query("INSERT INTO broadcast_sessions(model_id,first_seen,last_seen,start_known) VALUES($1,now()-interval '1 minute',now(),false) RETURNING id",[model.id])).rows[0];
 const message={id:'fixture-message',type:'tip',time:new Date().toISOString(),userId:null,username:'anonymous',text:'',amount:25,anonymous:true,source:'live'};
 await saveChatMessage(db,model.id,message);await saveChatMessage(db,model.id,{...message,source:'history'});
 const rows=(await db.query('SELECT * FROM chat_events WHERE model_id=$1',[model.id])).rows;assert.equal(rows.length,1);assert.equal(rows[0].session_id,session.id);assert.equal(rows[0].amount,'25');assert.equal(rows[0].user_id,null);
 await saveChatMessage(db,model.id,{...message,id:'older',time:new Date(Date.now()-3600000).toISOString()});assert.equal((await db.query("SELECT session_id FROM chat_events WHERE model_id=$1 AND message_id='older'",[model.id])).rows[0].session_id,null);
 console.log('PASS: tip deduplication, anonymous identity and historical session boundaries; rolled back');
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
