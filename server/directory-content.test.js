import test from 'node:test';
import assert from 'node:assert/strict';
import {filterDirectory} from '../src/directory-filters.js';
test('content count sorting includes zero, numeric strings and stable name ties',()=>{
 const models=[{name:'Z',content_count:0},{name:'B',content_count:'12'},{name:'A',content_count:12},{name:'C'}];
 assert.deepEqual(filterDirectory(models,{sort:'content'}).map(m=>m.name),['A','B','C','Z']);
 assert.deepEqual(filterDirectory(models,{sort:'contentAsc'}).map(m=>m.name),['C','Z','A','B']);
 assert.equal(models[0].name,'Z');
});
