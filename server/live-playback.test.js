import test from 'node:test';
import assert from 'node:assert/strict';
import {manageLivePlayback} from '../src/live-playback.js';
function fixture(options={}){
 const video=new EventTarget();Object.assign(video,{currentTime:0,muted:false,ended:false,play:async()=>{video.dispatchEvent(new Event('play'));video.dispatchEvent(new Event('playing'));}});
 let time=0,tick,loads=0,repairs=0;const status=[];
 const controller=manageLivePlayback(video,{getHls:()=>({startLoad(){loads++;},recoverMediaError(){repairs++;},liveSyncPosition:20}),onStatus:s=>status.push(s),now:()=>time,interval:fn=>{tick=fn;return 1;},cancelInterval:()=>{tick=()=>{};},...options});
 return {video,controller,status,advance(n){time+=n;tick();},get loads(){return loads;},get repairs(){return repairs;}};
}
test('autoplay retries muted when sound is blocked',async()=>{
 const f=fixture();let calls=0;f.video.play=async()=>{calls++;if(!f.video.muted)throw Object.assign(new Error(),{name:'NotAllowedError'});};
 await f.controller.start();assert.equal(f.video.muted,true);assert.equal(calls,2);f.controller.close();
});
test('stalled live playback reloads and catches up; explicit pause prevents recovery',async()=>{
 const f=fixture();await f.controller.start();f.advance(11000);assert.equal(f.loads,1);assert.equal(f.video.currentTime,20);
 f.video.dispatchEvent(new Event('playing'));f.video.dispatchEvent(new Event('pause'));f.advance(20000);assert.equal(f.loads,1);
 f.video.dispatchEvent(new Event('play'));f.controller.recover(true);assert.equal(f.repairs,1);
 f.controller.close();f.advance(30000);assert.equal(f.loads,1);
});
test('repeated failures have bounded retries and cleanup removes listeners',()=>{
 const f=fixture();f.controller.recover();f.video.currentTime=0;f.advance(9000);f.controller.recover();f.advance(9000);f.controller.recover();f.advance(9000);f.controller.recover();assert.ok(f.loads<=3);
 f.controller.close();const n=f.status.length;f.video.dispatchEvent(new Event('playing'));assert.equal(f.status.length,n);
});

test('exhausted playback recovery requests a new session after cooldown',()=>{
 let reconnects=0;const f=fixture({onReconnect:()=>reconnects++});
 f.controller.recover();f.video.currentTime=0;f.advance(9000);f.controller.recover();f.advance(9000);f.controller.recover();f.advance(31000);assert.equal(reconnects,1);f.advance(60000);assert.equal(reconnects,1);f.controller.close();
});
