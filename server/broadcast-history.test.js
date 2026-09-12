import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyObservation} from './broadcast-history.js';
const t='2026-09-12T00:00:00Z';
test('first seen online is partial; offline to online is observed start',()=>{
 assert.equal(classifyObservation(null,{time:t,online:true},5).startKnown,false);
 assert.equal(classifyObservation({observed_at:t,online:false},{time:'2026-09-12T00:00:05Z',online:true},5).startKnown,true);
});
test('only consecutive online intervals count; gaps cannot become full broadcasts',()=>{
 const previous={observed_at:t,online:true};
 assert.equal(classifyObservation(previous,{time:'2026-09-12T00:00:05Z',online:true},5).seconds,5);
 assert.equal(classifyObservation(previous,{time:'2026-09-12T00:00:05Z',online:false},5).seconds,0);
 const gap=classifyObservation(previous,{time:'2026-09-12T00:10:00Z',online:true},5);assert.equal(gap.gap,true);assert.equal(gap.seconds,0);assert.equal(gap.startKnown,false);
});
