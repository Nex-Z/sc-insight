import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {mp4NeedsIndex} from './playback-file.js';
const box=(type,data=Buffer.alloc(0))=>{const b=Buffer.alloc(8+data.length);b.writeUInt32BE(b.length);b.write(type,4);data.copy(b,8);return b;};
test('recognizes fragmented and tail-index MP4 without reading media payload',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mp4-index-test-'));
 try{for(const [name,boxes,want] of [
 ['fast',[box('ftyp'),box('moov',box('trak')),box('mdat')],false],
 ['fragment',[box('ftyp'),box('moov',box('mvex')),box('moof'),box('mdat')],true],
 ['tail',[box('ftyp'),box('mdat'),box('moov')],true],
 ['truncated',[Buffer.from([0,0,0,20,109,111,111,118])],false]
 ]){const file=path.join(root,name+'.mp4');await fs.writeFile(file,Buffer.concat(boxes));assert.equal(await mp4NeedsIndex(file),want,name);}}
 finally{await fs.rm(root,{recursive:true,force:true});}
});
