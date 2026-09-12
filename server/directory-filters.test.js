import test from 'node:test';
import assert from 'node:assert/strict';
import {filterDirectory} from '../src/directory-filters.js';
const rows=[{name:'a',country:'CN',viewers:100,fresh:true,online:true,monitored:true,growth:-5},{name:'b',country:'CN',viewers:200,fresh:false,online:true,favorite:true,growth:null},{name:'c',country:'US',viewers:50,fresh:true,online:false,growth:10}];
test('directory filters combine country, status, group and inclusive viewer bounds',()=>{
 assert.deepEqual(filterDirectory(rows,{region:'CN',online:'online',group:'monitored',min:'100',max:'100'}).map(m=>m.name),['a']);
 assert.deepEqual(filterDirectory(rows,{online:'offline'}).map(m=>m.name),['c']);
 assert.deepEqual(filterDirectory(rows,{online:'unknown'}).map(m=>m.name),['b']);
});
test('unknown growth sorts after negative growth; absent viewers do not match numeric filters',()=>{
 assert.deepEqual(filterDirectory(rows,{sort:'growth'}).map(m=>m.name),['c','a','b']);
 assert.equal(filterDirectory([{name:'unknown',viewers:null}],{min:'0'}).length,0);
 assert.equal(filterDirectory(rows,{min:'300',max:'100'}).length,0);
});
