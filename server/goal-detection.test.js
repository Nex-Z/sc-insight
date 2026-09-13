import test from 'node:test';
import assert from 'node:assert/strict';
import {observeGoal,mergeHighlightWindow} from './goal-detection.js';
const goal=spent=>({description:'当前目标',target:1000,spent});
test('goal near and completion each notify once, serialized state survives restart',()=>{
 let r=observeGoal(null,goal(500),0);assert.deepEqual(r.signals,[]);
 r=observeGoal(r.state,goal(990),10000);assert.equal(r.signals[0].kind,'goalNear');
 r=observeGoal(JSON.parse(JSON.stringify(r.state)),goal(995),20000);assert.deepEqual(r.signals,[]);
 r=observeGoal(r.state,goal(1000),30000);assert.deepEqual(r.signals.map(s=>s.kind),['goalComplete']);
 r=observeGoal(r.state,goal(1000),40000);assert.deepEqual(r.signals,[]);
});
test('jump straight to completion emits only completed; first seen completed is not a new event',()=>{
 const first=observeGoal(null,goal(0),0);assert.deepEqual(observeGoal(first.state,goal(1500),10000).signals.map(s=>s.kind),['goalComplete']);
 assert.deepEqual(observeGoal(null,goal(1000),0).signals,[]);
});
test('goal switch, disappearance, unknown amount, gap and reset never fabricate completion',()=>{
 const first=observeGoal(null,goal(990),0);
 assert.deepEqual(observeGoal(first.state,{...goal(1000),description:'新目标'},10000).signals,[]);
 assert.deepEqual(observeGoal(first.state,null,10000).signals,[]);
 const missing=observeGoal(first.state,null,10000);assert.deepEqual(observeGoal(missing.state,goal(990),20000).signals,[]);assert.deepEqual(observeGoal(missing.state,goal(1000),20000).signals,[]);
 assert.deepEqual(observeGoal(first.state,goal(null),10000).signals,[]);
 assert.deepEqual(observeGoal(first.state,goal(1000),60000).signals,[]);
 const reset=observeGoal(first.state,goal(0),10000);assert.ok(reset.state.cycle>first.state.cycle);
 assert.equal(observeGoal(reset.state,goal(990),20000).signals[0].kind,'goalNear');
});
test('configurable percentage and rounded display do not round early for detection',()=>{
 assert.equal(observeGoal(null,goal(989.99),0).signals.length,0);
 assert.equal(observeGoal(null,goal(980),0,2).signals[0].kind,'goalNear');
});
test('goal completion upgrades an existing audience highlight without a second recording or shortening',()=>{
 let h=mergeHighlightWindow(null,[{kind:'viewers'}],1000000);
 h={...h,id:123};const start=h.start;
 h=mergeHighlightWindow(h,[{kind:'goalNear',cycle:1,at:1010000}],1010000);assert.ok(h.pendingGoals[1]);
 h=mergeHighlightWindow(h,[{kind:'goalComplete',cycle:1,at:2000000}],2000000);assert.equal(h.id,123);assert.equal(h.start,start);assert.equal(h.end,2900000);assert.deepEqual(h.pendingGoals,{});
 const next=mergeHighlightWindow(h,[{kind:'tips'}],2010000);assert.equal(next.end,2900000);assert.equal(next.reasons.length,4);
});
test('consecutive goals extend a single clip; ordinary clips keep cap and exclude archived time',()=>{
 let h=mergeHighlightWindow(null,[{kind:'goalComplete',cycle:1,at:1000000}],1000000);
 h=mergeHighlightWindow(h,[{kind:'goalComplete',cycle:2,at:1200000}],1200000);assert.equal(h.end,2100000);
 const normal=mergeHighlightWindow(null,[{kind:'tips'}],1000000);assert.equal(mergeHighlightWindow(normal,[{kind:'tips'}],2000000).end,normal.start+900000);
 assert.equal(mergeHighlightWindow(null,[],1000000,{recordedThrough:990000}).start,990000);
 assert.equal(mergeHighlightWindow(null,[],1000000,{bufferStart:995000}).start,995000);
});
