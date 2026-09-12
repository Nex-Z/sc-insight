import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeModels} from './collector.js';
import {validateRule} from './validation.js';
import {pool} from './db.js';
test('metadata normalization deduplicates and discards media URLs',()=>{
 const m={id:42,username:'test-model',viewersCount:100,status:'public',isOnline:true,country:'us',avatarUrl:'not-stored',streamName:'not-stored'};
 const rows=normalizeModels({blocks:[{models:[m]},{models:[m,{id:43,username:'invalid',viewersCount:-1}]}]});
 assert.equal(rows.length,1);assert.equal(rows[0].sourceId,'42');assert.equal(rows[0].online,true);assert.equal(rows[0].viewers,100);assert.equal(rows[0].avatarUrl,undefined);assert.equal(rows[0].streamName,undefined);
});
test('invalid and empty upstream responses fail instead of manufacturing offline records',()=>{assert.throws(()=>normalizeModels({}));assert.throws(()=>normalizeModels({blocks:[]}));});
test('rule validation bounds inputs',()=>{assert.equal(validateRule({name:'',condition:'a'}),null);assert.equal(validateRule({name:'a'.repeat(81),condition:'b'}),null);assert.deepEqual(validateRule({name:' test ',condition:' 主播上线时 '}),{name:'test',condition:'主播上线时'});});
test.after(()=>pool.end());
