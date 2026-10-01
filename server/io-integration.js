import assert from 'node:assert/strict';
import {pool} from './db.js';
import {saveChatMessages} from './chat-monitor.js';
import {saveGoalObservation} from './goal-monitor.js';
import {goalCheckpoint} from './goal-checkpoint.js';
import {createDashboardLoader} from './dashboard.js';

// TEMP tables + rollback: exercise real PostgreSQL without touching live rows.
const db=await pool.connect();
try{
 await db.query('BEGIN');
 await db.query('SET LOCAL search_path=pg_temp');
 await db.query(`CREATE TEMP TABLE broadcast_sessions(id bigint,model_id integer,first_seen timestamptz,ended_at timestamptz);
 CREATE TEMP TABLE chat_events(model_id integer,message_id text,session_id bigint,message_at timestamptz,received_at timestamptz,kind text,user_id text,username text,body text,amount bigint,anonymous boolean,source text,PRIMARY KEY(model_id,message_id));
 CREATE TEMP TABLE goal_monitor_state(model_id integer PRIMARY KEY,state jsonb DEFAULT '{}',error text,updated_at timestamptz DEFAULT now());
 CREATE TEMP TABLE goal_signals(id bigserial,model_id integer,cycle bigint,kind text,payload jsonb,observed_at timestamptz,UNIQUE(model_id,cycle,kind));
 CREATE TEMP TABLE events(model_id integer,title text,detail text,kind text,payload jsonb,created_at timestamptz);
 CREATE TEMP TABLE model_snapshots(model_id integer,viewers integer,scope text,sampled_at timestamptz);`);
 const now=Date.now(),time=new Date(now).toISOString(),received=new Date(now+100).toISOString();
 await db.query('INSERT INTO broadcast_sessions VALUES(1,7,$1,NULL)',[new Date(now-10000)]);
 const message={id:'a',type:'text',time,receivedAt:received,text:'fixture',anonymous:false,source:'live'};
 await saveChatMessages(db,7,[message,{...message,id:'b',type:'tip',amount:20},message,{...message,id:'bad',time:'invalid'}]);
 const chat=(await db.query('SELECT * FROM chat_events ORDER BY message_id')).rows;
 assert.equal(chat.length,2);assert.equal(chat[0].session_id,'1');assert.equal(chat[0].received_at.toISOString(),received);assert.equal(chat[1].amount,'20');
 let previous,writes=0;const model={id:7,name:'fixture',favorite:true,config:{}};
 for(let i=0;i<12;i++){
  const at=now+i*5000,goal={description:'fixture',target:100,spent:50};
  const {result,persist}=goalCheckpoint(previous,goal,at,1);
  if(persist){await saveGoalObservation(db,model,goal,at,result);writes++;}
  previous={state:result.state,savedState:persist?result.state:previous.savedState,savedAt:persist?at:previous.savedAt};
 }
 assert.equal(writes,2);
 const goal={description:'fixture',target:100,spent:100};
 const completed=goalCheckpoint(previous,goal,now+60000,1);
 await saveGoalObservation(db,model,goal,now+60000,completed.result);
 await saveGoalObservation(db,model,goal,now+65000);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM events')).rows[0].n,1);
 await db.query("INSERT INTO model_snapshots VALUES(7,10,'general',now()),(8,20,'general',now()),(7,1000,'tracked',now())");
 let queries=0;const load=createDashboardLoader({query:sql=>{queries++;return db.query(sql);}});
 const [a,b]=await Promise.all([load(),load()]);assert.equal(queries,2);assert.equal(a,b);assert.equal(a.history[0].value,30);
 console.log(JSON.stringify({ok:true,goalObservations:12,goalWrites:writes,chatRows:chat.length,dashboardQueries:queries}));
}finally{
 await db.query('ROLLBACK');db.release();await pool.end();
}
