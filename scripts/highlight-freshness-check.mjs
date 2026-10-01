import {build} from 'esbuild';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

// Exercise the actual scheduler with a database checkpoint older than 20 seconds.
const output=path.resolve('artifacts/highlight-freshness-check.mjs');
const base=Date.now(),originalNow=Date.now;
let now=base,live,reads=0,runner;
const persisted={id:123,monitored:true,online:true,room_status:'public',last_seen_at:new Date(base),config:{prebufferSeconds:0}};
const db={async query(sql){
 if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
 if(sql.includes('JOIN models m'))return {rows:[persisted]};
 if(sql.includes('FROM broadcast_observations'))reads++;
 return {rows:[]};
},release(){}};
db.connect=async()=>db;
globalThis.__freshness={db,current:model=>({...model,...live})};
try{
 await build({entryPoints:['server/highlights.js'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:output,plugins:[{
  name:'isolated-inputs',setup(b){
   b.onResolve({filter:/^\.\/db\.js$/},()=>({path:'db',namespace:'fixture'}));
   b.onResolve({filter:/^\.\/polling\.js$/},()=>({path:'polling',namespace:'fixture'}));
   b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='db'?'export const pool=globalThis.__freshness.db;':'export const currentTrackedModel=m=>globalThis.__freshness.current(m);export const recentTrackedObservations=(id,rows)=>rows;'}));
  }
 }]});
 runner=await import(pathToFileURL(output));Date.now=()=>now;
 live={last_seen_at:new Date(now)};
 await runner.startHighlights();await runner.syncHighlights();
 const initial=reads;
 for(let seconds=5;seconds<=65;seconds+=5){
  now=base+seconds*1000;live={last_seen_at:new Date(now)};
  await runner.syncHighlights();
  assert.match(runner.highlightState(123).status,/预热/);
 }
 assert.equal(reads-initial,13,'scheduler keeps sampling across the one-minute database checkpoint');
 now+=5000;live={online:false,room_status:'offline',last_seen_at:new Date(now)};
 const before=reads;await runner.syncHighlights();
 assert.equal(reads,before,'live offline transition stops sampling immediately');
 console.log('PASS: 13 five-second scheduler ticks with stale DB timestamps; live offline transition stops immediately.');
}finally{
 if(runner)await runner.stopHighlights();
 Date.now=originalNow;delete globalThis.__freshness;
 await fs.unlink(output).catch(()=>{});
}
