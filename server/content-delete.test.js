import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {checkedMediaFile,deleteContent} from './content-delete.js';

test('only the selected media and its metadata are deleted; database failure restores file',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sc-delete-'));
 const file=path.join(root,'one.mp4'),neighbor=path.join(root,'two.mp4');
 const record={id:'1',status:'已完成',directory:root,filename:'one.mp4'};
 const queries=[];let fail=false;
 const client={release(){},async query(sql,args){queries.push([sql,args]);if(sql.startsWith('SELECT'))return {rows:[record]};if(fail&&sql.startsWith('DELETE FROM highlights'))throw Error('DB failure');return {rows:[]};}};
 const options={dbPool:{connect:async()=>client},storage:async()=>({directory:root})};
 try{
  await fs.writeFile(file,'video');await fs.writeFile(neighbor,'keep');fail=true;
  await assert.rejects(deleteContent('highlight','1',options));assert.equal(await fs.readFile(file,'utf8'),'video');assert.deepEqual((await fs.readdir(root)).sort(),['one.mp4','two.mp4']);
  fail=false;await deleteContent('highlight','1',options);await assert.rejects(fs.access(file));assert.equal(await fs.readFile(neighbor,'utf8'),'keep');
  assert.ok(queries.some(([q,a])=>q.startsWith('DELETE FROM content_metadata')&&a[0]==='highlight'&&a[1]==='1'));
  await deleteContent('highlight','1',options); // Already missing files can be removed from the library.
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('active media and invalid IDs cannot be deleted',async()=>{
 const options={dbPool:{connect:async()=>({release(){},query:async sql=>({rows:sql.startsWith('SELECT')?[{status:'归档中'}]:[]})})},storage:()=>{throw Error('must not touch disk');}};
 for(const id of ['0','-1','1;delete','9223372036854775808'])await assert.rejects(deleteContent('highlight',id,options),{status:400});
 await assert.rejects(deleteContent('highlight','1',options),{status:409});
});

test('deletion rejects traversal, directories and symlink escape',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sc-scope-'));
 try{
  await assert.rejects(checkedMediaFile({directory:root,filename:'../outside.mp4'},root));
  await assert.rejects(checkedMediaFile({directory:path.dirname(root),filename:'outside.mp4'},root),{status:409});
  await fs.mkdir(path.join(root,'directory.mp4'));
  await assert.rejects(checkedMediaFile({directory:root,filename:'directory.mp4'},root),{status:409});
  await fs.symlink(path.dirname(root),path.join(root,'escape'),'junction');
  await assert.rejects(checkedMediaFile({directory:root,filename:'escape'},root),{status:409});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
