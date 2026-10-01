import 'dotenv/config';
import pg from 'pg';
// Run explicitly outside a transaction. Never rebuild the live table or delete history.
const db=new pg.Client({connectionTimeoutMillis:5000});
await db.connect();
try{
 await db.query("SET lock_timeout='5s'");
 await db.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS snapshots_general_time_cover ON model_snapshots(sampled_at) INCLUDE(model_id,viewers) WHERE scope='general'");
 const result=await db.query("SELECT i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname='snapshots_general_time_cover' AND c.relnamespace='public'::regnamespace");
 if(!result.rows[0]?.indisvalid)throw Error('Dashboard index is missing or invalid; inspect before retrying.');
 console.log('Dashboard covering index ready.');
}finally{await db.end();}
