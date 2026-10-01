import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import {pool} from './db.js';
import {insightRoutes} from './insight-routes.js';
import {highlightRoutes} from './highlight-routes.js';

// Run only against an isolated test database, never the deployed library.
assert.match(process.env.PGDATABASE||'',/^sc_media_test_\d+$/);
const root=await fs.mkdtemp(path.join(os.tmpdir(),'sc-delete-api-'));
const app=express();app.use(express.json());app.use('/api',insightRoutes);app.use('/api',highlightRoutes);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}/api`;
const remove=(url,confirm=true)=>fetch(base+url,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm})});
try{
 await pool.query("INSERT INTO settings(key,value) VALUES('storage',$1)",[{directory:root}]);
 const {rows:[model]}=await pool.query("INSERT INTO models(name,country,language,color) VALUES('delete_fixture','测试','测试','#888') RETURNING id");
 await fs.writeFile(path.join(root,'highlight.mp4'),'highlight');await fs.writeFile(path.join(root,'recording.mp4'),'recording');await fs.writeFile(path.join(root,'keep.ts'),'unrelated cache');
 const {rows:[h]}=await pool.query("INSERT INTO highlights(model_id,directory,filename,status) VALUES($1,$2,'highlight.mp4','已完成') RETURNING id",[model.id,root]);
 const {rows:[r]}=await pool.query("INSERT INTO recordings(model_id,directory,filename,status) VALUES($1,$2,'recording.mp4','已完成') RETURNING id",[model.id,root]);
 for(const [kind,id] of [['highlight',h.id],['recording',r.id]])await pool.query('INSERT INTO content_metadata(kind,item_id,title) VALUES($1,$2,$3)',[kind,id,'metadata']);
 await pool.query("INSERT INTO goal_signals(model_id,cycle,kind,payload,observed_at,highlight_id) VALUES($1,1,'goalComplete','{}',now(),$2)",[model.id,h.id]);
 assert.equal((await remove(`/content/highlight/${h.id}`,false)).status,400);assert.equal(await fs.readFile(path.join(root,'highlight.mp4'),'utf8'),'highlight');
 await pool.query("UPDATE highlights SET status='录制中' WHERE id=$1",[h.id]);assert.equal((await remove(`/highlights/${h.id}`)).status,409);
 await pool.query("UPDATE highlights SET status='已完成' WHERE id=$1",[h.id]);assert.equal((await remove(`/highlights/${h.id}`)).status,200);
 await assert.rejects(fs.access(path.join(root,'highlight.mp4')));assert.equal(await fs.readFile(path.join(root,'recording.mp4'),'utf8'),'recording');
 assert.equal((await pool.query("SELECT * FROM content_metadata WHERE kind='highlight' AND item_id=$1",[h.id])).rowCount,0);
 assert.equal((await pool.query('SELECT highlight_id FROM goal_signals WHERE model_id=$1',[model.id])).rows[0].highlight_id,null);
 assert.equal((await fetch(base+`/content/highlight/${h.id}`)).status,404);assert.equal((await remove(`/highlights/${h.id}`)).status,404);
 assert.equal((await remove(`/content/recording/${r.id}`)).status,200);await assert.rejects(fs.access(path.join(root,'recording.mp4')));
 assert.equal((await pool.query('SELECT * FROM content_metadata')).rowCount,0);assert.equal(await fs.readFile(path.join(root,'keep.ts'),'utf8'),'unrelated cache');
 console.log('PASS confirmation required, active refusal, highlight and recording deletion, metadata cleanup, goal FK, unrelated file preservation, repeated delete');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));await pool.end();await fs.rm(root,{recursive:true,force:true});}
