import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {advertisedFormat,rewriteMouflon,decodeMediaUri,bestVariant} from './mouflon.js';
import keys from './public-format-keys.json' with {type:'json'};

test('restores public v2 filename metadata and replaces full segments, retaining initialization',()=>{
 const format=keys.formats[0],name='PlainPublicName1',bytes=Buffer.from(name),mask=createHash('sha256').update(format.key).digest();
 for(let i=0;i<bytes.length;i++)bytes[i]^=mask[i%32];
 const encoded=[...bytes.toString('base64')].reverse().join('');
 const uri=`https://cdn.example/1/1_20_${encoded}_1234.mp4`;
 const master=`#EXTM3U\n#EXT-X-MOUFLON:PSCH:${format.scheme}:${format.id}\n`;
 assert.equal(advertisedFormat(master),format);assert.equal(advertisedFormat('#EXT-X-MOUFLON:PSCH:v2:unknown'),undefined);
 const body=master+'#EXT-X-MEDIA-SEQUENCE:20\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2,\n#EXT-X-MOUFLON:URI:'+uri+'\n../media.mp4\n';
 const result=rewriteMouflon(body,format,'https://cdn.example/live.m3u8');
 assert.ok(result.includes(`1_20_${name}_1234.mp4`));assert.ok(result.includes('URI="init.mp4"'));assert.ok(!result.includes('MOUFLON'));assert.ok(!result.includes('../media.mp4'));
 assert.throws(()=>rewriteMouflon(body+'#EXT-X-ENDLIST',format,'https://cdn.example/'));
 assert.throws(()=>decodeMediaUri(uri,'wrong-format-key'));
 assert.equal(bestVariant('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\na.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2\nb.m3u8?existing=1','https://example/master.m3u8'),'https://example/b.m3u8?existing=1');
});
