import {pool} from './db.js';
import {connectLiveChat} from './live-chat.js';
export const chatSchema=`
CREATE TABLE IF NOT EXISTS chat_events (
 model_id INTEGER NOT NULL REFERENCES models(id),message_id TEXT NOT NULL,session_id BIGINT REFERENCES broadcast_sessions(id),
 message_at TIMESTAMPTZ NOT NULL,received_at TIMESTAMPTZ NOT NULL DEFAULT now(),kind TEXT NOT NULL,
 user_id TEXT,username TEXT,body TEXT,amount BIGINT,anonymous BOOLEAN NOT NULL,source TEXT NOT NULL,
 PRIMARY KEY(model_id,message_id));
CREATE INDEX IF NOT EXISTS chat_event_model_time ON chat_events(model_id,message_at);
CREATE INDEX IF NOT EXISTS chat_event_session ON chat_events(session_id);
CREATE TABLE IF NOT EXISTS chat_coverage (
 id BIGSERIAL PRIMARY KEY,model_id INTEGER NOT NULL REFERENCES models(id),started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),ended_at TIMESTAMPTZ,reason TEXT);
ALTER TABLE broadcast_intervals ADD COLUMN IF NOT EXISTS room_status TEXT;
`;
export async function saveChatMessage(db,modelId,m){
 if(!['text','tip'].includes(m.type)||!m.id||!Number.isFinite(Date.parse(m.time))||Date.parse(m.time)>Date.now()+60000)return;
 await db.query(`INSERT INTO chat_events(model_id,message_id,session_id,message_at,kind,user_id,username,body,amount,anonymous,source)
 VALUES($1,$2,(SELECT id FROM broadcast_sessions WHERE model_id=$1 AND first_seen<=$3 AND (ended_at IS NULL OR ended_at>=$3) ORDER BY first_seen DESC LIMIT 1),$3,$4,$5,$6,$7,$8,$9,$10)
 ON CONFLICT(model_id,message_id) DO NOTHING`,[modelId,m.id,m.time,m.type,m.userId,m.username,m.text,m.amount,m.anonymous,m.source||'live']);
}
const clients=new Map(),backoff=new Map();let running=false,stopped=false,timer;
async function stopClient(id,reason){const c=clients.get(id);if(!c)return;clients.delete(id);c.stopped=true;c.close?.();await c.queue;if(c.coverage)await pool.query('UPDATE chat_coverage SET ended_at=now(),reason=$2 WHERE id=$1 AND ended_at IS NULL',[c.coverage,reason]);}
export function chatMonitorState(){return {active:[...clients].map(([modelId,c])=>({modelId,status:c.status})),retrying:backoff.size};}
export async function syncChatMonitor(){
 if(running||stopped)return;running=true;
 try{
 const {rows}=await pool.query("SELECT * FROM models WHERE (favorite OR monitored) AND online AND room_status='public' AND last_seen_at>now()-interval '3 minutes'");
 const wanted=new Set(rows.map(m=>m.id));for(const id of clients.keys())if(!wanted.has(id))await stopClient(id,'room_not_public_or_tracking_disabled');
 for(const m of rows){
  const c=clients.get(m.id);if(c){if(c.coverage)await pool.query('UPDATE chat_coverage SET last_seen=now() WHERE id=$1',[c.coverage]);if(c.failed||Date.now()-c.created>30000&&c.status==='connecting'){await stopClient(m.id,'connection_lost');const old=backoff.get(m.id);backoff.set(m.id,{at:Date.now()+Math.min(120000,10000*2**(old?.attempt||0)),attempt:Math.min(4,(old?.attempt||0)+1)});}continue;}
  if(clients.size>=32||(backoff.get(m.id)?.at||0)>Date.now())continue;
  const client={created:Date.now(),queue:Promise.resolve(),pending:0,status:'connecting',stopped:false};clients.set(m.id,client);
  void connectLiveChat(m,(type,data)=>{
   if(client.stopped)return;
   if(client.pending>=500){client.failed=true;client.status='storage_backpressure';return;}client.pending++;
   client.queue=client.queue.then(async()=>{
    if(type==='message')await saveChatMessage(pool,m.id,data);
    if(type==='connection'){client.status=data.state;if(data.state==='connected'&&!client.coverage){client.coverage=(await pool.query('INSERT INTO chat_coverage(model_id) VALUES($1) RETURNING id',[m.id])).rows[0].id;backoff.delete(m.id);}else if(['error','disconnected'].includes(data.state))client.failed=true;}
   }).catch(()=>{client.failed=true;client.status='storage_error';}).finally(()=>client.pending--);
  }).then(close=>{if(client.stopped)close();else client.close=close;}).catch(()=>{client.failed=true;client.status='connection_error';});
 }
 for(const id of backoff.keys())if(!wanted.has(id))backoff.delete(id);
 }finally{running=false;}
}
export async function startChatMonitor(){await pool.query("UPDATE chat_coverage SET ended_at=last_seen,reason='process_interrupted' WHERE ended_at IS NULL");const tick=()=>void syncChatMonitor().catch(e=>console.error('Chat monitor:',e.message));tick();timer=setInterval(tick,5000);}
export async function stopChatMonitor(){stopped=true;clearInterval(timer);for(const id of clients.keys())await stopClient(id,'shutdown');}
