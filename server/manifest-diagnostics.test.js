import test from 'node:test';
import assert from 'node:assert/strict';
import {describeManifest,replayHeaders} from './manifest-diagnostics.js';
test('live sequence plus HTTP 200 is not enough when segment addresses are placeholders',()=>{
 const r=describeManifest('#EXTM3U\n#EXT-X-MOUFLON:PSCH:v2:fixture\n#EXT-X-MOUFLON:URI:123:opaque\n#EXT-X-MEDIA-SEQUENCE:400\n#EXTINF:2,\n../media.mp4\n');
 assert.equal(r.mediaSequence,400);assert.equal(r.ended,false);assert.equal(r.needsAddressAdapter,true);assert.equal(r.placeholderReferences,1);assert.equal(JSON.stringify(r).includes('opaque'),false);
});
test('reports finite replacement media distinctly from an ordinary live playlist',()=>{
 const finite=describeManifest('#EXTM3U\n#EXTINF:20.6,\nchunk.m4s\n#EXT-X-ENDLIST');assert.equal(finite.ended,true);assert.equal(finite.duration,20.6);
 const live=describeManifest('#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:12\n#EXTINF:2,\npart.ts');assert.equal(live.ended,false);assert.equal(live.needsAddressAdapter,false);
});
test('HTTP replay retains actual session values without HTTP/2 transport fields',()=>{
 assert.deepEqual(replayHeaders({':path':'/live',Host:'example.org','Accept-Encoding':'gzip',cookie:'existing=1',origin:'https://example.org',referer:'https://example.org/room'}),{cookie:'existing=1',origin:'https://example.org',referer:'https://example.org/room'});
});
