import assert from 'node:assert/strict';
import {pool} from './db.js';
import {chatSchema,saveChatMessages} from './chat-monitor.js';
import {chatMessage} from './live-chat.js';
import {detectHighlight,validateHighlightSettings} from './highlight-detection.js';
const db=await pool.connect();
try{
 await db.query('BEGIN');
 const schema='tip_check_'+Date.now();await db.query(`CREATE SCHEMA ${schema}`);await db.query(`SET LOCAL search_path TO ${schema}`);
 await db.query('CREATE TABLE models(id INTEGER PRIMARY KEY); CREATE TABLE broadcast_sessions(id BIGSERIAL PRIMARY KEY,model_id INTEGER,first_seen TIMESTAMPTZ,ended_at TIMESTAMPTZ); CREATE TABLE broadcast_intervals(id BIGSERIAL PRIMARY KEY); INSERT INTO models VALUES(1)');
 await db.query(chatSchema);await db.query(chatSchema);
 const now=Date.now(),since=now-360000,time=new Date(now-5000).toISOString();
 const raw={id:'menu',type:'tip',createdAt:time,details:{amount:300,source:'tipMenu'}};
 await saveChatMessages(db,1,[{...chatMessage(raw),source:'live',receivedAt:time},{...chatMessage({...raw,id:'ordinary',details:{amount:200}}),source:'live',receivedAt:time}]);
 const {rows}=await db.query('SELECT message_at,received_at,amount,source,tip_menu FROM chat_events ORDER BY message_id');
 assert.deepEqual(rows.map(r=>r.tip_menu),[true,false]);
 const decision=detectHighlight({now,since,observations:Array.from({length:73},(_,i)=>({observed_at:new Date(since+i*5000),online:true,room_status:'public',viewers:100})),coverage:[{started_at:new Date(since),last_seen:new Date(now)}],tips:rows,settings:validateHighlightSettings({viewerRecord:false,tipRecord:false,plainTipRecord:true,menuTipRecord:true,plainTipMinimum:200,menuTipMinimum:300})});
 assert.deepEqual(decision.reasons.map(r=>[r.kind,r.value]),[['plainTip',200],['menuTip',300]]);
 console.log('PASS isolated PostgreSQL schema migration, platform message persistence and independent threshold detection');
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
