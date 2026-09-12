import test from 'node:test';
import assert from 'node:assert/strict';
import {recordingConcurrency,recordingDurationArgs} from './recording-options.js';
test('continuous recording has no duration limit; segmented and legacy records retain it',()=>{
 assert.deepEqual(recordingDurationArgs({until_offline:true,max_seconds:5}),[]);
 assert.deepEqual(recordingDurationArgs({until_offline:false,max_seconds:60}),['-t','60']);
 assert.deepEqual(recordingDurationArgs({max_seconds:3600}),['-t','3600']);
});
test('recording concurrency validates deployment resource limits',()=>{
 assert.equal(recordingConcurrency('8'),8);
 for(const v of ['0','-1','33','2.5','invalid',''])assert.throws(()=>recordingConcurrency(v));
});
