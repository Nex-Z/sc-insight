import test from 'node:test';
import assert from 'node:assert/strict';
import {groupStreams,captureView,streamKey} from '../src/capture-groups.js';
const sample=(id,query='',extra={})=>({id,url:'https://example.org/live.m3u8'+query,method:'GET',kind:'HLS',recordable:true,score:100,lastSeen:Number(id),count:1,...extra});
test('LL-HLS reloads collapse; recording retains the exact latest observed URL and id',()=>{
 const old=sample('1','?auth=existing&_HLS_msn=10&_HLS_part=1');
 const latest=sample('2','?auth=existing&_HLS_msn=11&_HLS_part=0&_HLS_skip=YES');
 const [group]=groupStreams([latest,old]);assert.equal(group.id,latest.id);assert.equal(group.url,latest.url);assert.equal(group.requestCount,2);assert.equal(group.versions,2);assert.equal(groupStreams([latest,old]).length,1);assert.equal(streamKey(old),streamKey(latest));
});
test('authorization, stream identity, method and quality parameters are never discarded',()=>{
 const samples=[sample('1','?token=a'),sample('2','?token=b'),sample('3','?quality=720'),sample('4','?quality=1080'),sample('5','?channel=1'),sample('6','?channel=2'),sample('7','?token=a',{method:'POST'})];assert.equal(groupStreams(samples).length,7);
});
test('default view prioritizes playlists; raw mode retains all requests and segments',()=>{
 const rows=[sample('1','',{master:true,score:120}),sample('2','?_HLS_msn=1',{url:'https://example.org/variant.m3u8?_HLS_msn=1'}),sample('3','',{kind:'video',url:'https://example.org/part.mp4',score:75}),sample('4','',{kind:'segment',url:'https://example.org/a.ts',recordable:false})];
 const view=captureView(rows,{recommendedId:'1'});assert.equal(view.visible.length,2);assert.equal(view.recommended.id,'1');assert.equal(captureView(rows,{showAll:true}).visible.length,4);
});
test('stable selection key follows a newer request; newest failure is not silently replaced by older success',()=>{
 const previous=sample('1','?_HLS_part=0'),next=sample('2','?_HLS_part=1');const selected=groupStreams([previous])[0].groupKey;
 assert.equal(groupStreams([previous,next]).find(c=>c.groupKey===selected).id,'2');
 assert.equal(captureView([previous,{...next,recordable:false,status:403}]).recommended,undefined);
});
