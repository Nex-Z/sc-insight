import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHighlightCapacity,loadHighlightCapacity,saveHighlightCapacity,getHighlightLimit,idleHighlightsToRelease} from './highlight-capacity.js';
test('capacity persists across reload, rejects invalid values, and a failed save preserves active limit',async()=>{
 let saved;const db={query:async(sql,args)=>args?(saved=args[0],{}):{rows:saved?[{value:saved}]:[]}};
 await loadHighlightCapacity(db);assert.equal(getHighlightLimit(),2);
 await saveHighlightCapacity(8,db);assert.equal(getHighlightLimit(),8);await loadHighlightCapacity(db);assert.equal(getHighlightLimit(),8);
 for(const value of [0,33,1.2,'8',null])assert.throws(()=>validateHighlightCapacity(value));
 await assert.rejects(saveHighlightCapacity(4,{query:async()=>{throw Error('disk failure');}}));assert.equal(getHighlightLimit(),8);
 await saveHighlightCapacity(2,db);
});
test('lower capacity releases idle buffers first and only releases a recording after it finishes',()=>{
 const jobs=new Map([[1,{highlight:{id:1}}],[2,{}],[3,{highlight:{id:3}}],[4,{}]]);
 assert.deepEqual(idleHighlightsToRelease(jobs,4),[]);assert.deepEqual(idleHighlightsToRelease(jobs,3),[4]);assert.deepEqual(idleHighlightsToRelease(jobs,1),[4,2]);
 jobs.delete(4);jobs.delete(2);assert.deepEqual(idleHighlightsToRelease(jobs,1),[]);jobs.get(3).highlight=null;assert.deepEqual(idleHighlightsToRelease(jobs,1),[3]);
});
