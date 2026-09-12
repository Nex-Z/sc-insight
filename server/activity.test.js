import test from 'node:test';
import assert from 'node:assert/strict';
import {activitySummary} from './activity.js';
test('calendar preserves missing days, partial starts, and weekday hourly totals',()=>{
 const a=activitySummary([{day:'2026-09-11',hour:23,seconds:1800},{day:'2026-09-12',hour:0,seconds:600}],[{day:'2026-09-12',hour:0,samples:120},{day:'2026-09-10',hour:2,samples:10}],[{day:'2026-09-12',hour:0,starts:1,partial:2}],'2026-09-12');
 assert.equal(a.daily.length,365);assert.equal(a.daily.at(-1).seconds,600);assert.equal(a.daily.at(-2).seconds,1800);assert.equal(a.daily.at(-3).samples,10);assert.equal(a.daily.at(-3).seconds,0);assert.equal(a.daily.at(-4).samples,0);assert.equal(a.hours[5*24].starts,1);assert.equal(a.daily.at(-1).partial,2);assert.equal(a.hours.reduce((n,h)=>n+h.seconds,0),2400);
});
