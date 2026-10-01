import test from 'node:test';
import assert from 'node:assert/strict';
import {detectHighlight,validateHighlightSettings} from './highlight-detection.js';
import {chatMessage} from './live-chat.js';
import {saveChatMessages} from './chat-monitor.js';
const now=Date.now(),since=now-360000;
const base={now,since,observations:Array.from({length:73},(_,i)=>({observed_at:new Date(since+i*5000),online:true,room_status:'public',viewers:100})),coverage:[{started_at:new Date(since),last_seen:new Date(now)}],settings:validateHighlightSettings({viewerRecord:false,tipRecord:false,goalRecord:false,plainTipRecord:true,menuTipRecord:true,plainTipMinimum:100,menuTipMinimum:300})};
const tip=(amount,tip_menu)=>({amount,tip_menu,source:'live',message_at:new Date(now-5000),received_at:new Date(now-4000)});
const check=(tips,extra={})=>detectHighlight({...base,tips,...extra}).reasons;
test('independent single payment thresholds include equality and never combine payments',()=>{
 assert.deepEqual(check([tip(100,false)]).map(r=>r.kind),['plainTip']);
 assert.deepEqual(check([tip(300,true)]).map(r=>r.kind),['menuTip']);
 assert.deepEqual(check([tip(99,false),tip(299,true)]),[]);
 assert.deepEqual(check([tip(60,false),tip(60,false)]),[]);
 assert.deepEqual(check([tip(100,true)]),[]);
 assert.deepEqual(check([tip(100,false),tip(300,true)]).map(r=>r.value),[100,300]);
 assert.deepEqual(check([tip(100,false)],{settings:{...base.settings,plainTipRecord:false}}),[]);
 assert.deepEqual(check([tip(300,true)],{settings:{...base.settings,menuTipRecord:false}}),[]);
});
test('single payment rules reject unknown classification, stale/history data, gaps and unknown amounts',()=>{
 for(const t of [tip(1000,null),tip(1000,undefined),tip(null,false),tip(-1,true),{...tip(500,true),source:'history'},{...tip(500,true),received_at:new Date(now-60000)},{...tip(500,true),message_at:new Date(now+1000)}])assert.deepEqual(check([t]),[]);
 assert.deepEqual(check([tip(500,true)],{coverage:[]}),[]);
 assert.deepEqual(check([tip(500,true)],{since:now-100000}),[]);
 assert.deepEqual(check([tip(500,true)],{observations:[]}),[]);
});
test('new settings are opt-in and validated',()=>{
 const c=validateHighlightSettings({singleTip:800});assert.equal(c.plainTipRecord,false);assert.equal(c.menuTipRecord,false);assert.equal(c.singleTip,800);
 for(const key of ['plainTipMinimum','menuTipMinimum'])for(const value of [0,-1,1.5,'100',10000001,Infinity])assert.throws(()=>validateHighlightSettings({[key]:value}));
 for(const key of ['plainTipRecord','menuTipRecord'])assert.throws(()=>validateHighlightSettings({[key]:'true'}));
});
test('platform classification survives chat persistence and unknown historical rows stay unknown',async()=>{
 const raw={id:'1',type:'tip',createdAt:new Date(now).toISOString(),details:{amount:300,source:'tipMenu',body:'点歌'}};
 let saved;await saveChatMessages({query:async(sql,args)=>{assert.match(sql,/tip_menu boolean/);saved=JSON.parse(args[1]);}},1,[{...chatMessage(raw),source:'live'},chatMessage({...raw,id:'2',details:{amount:100}}),{id:'3',type:'tip',time:raw.createdAt,amount:500}]);
 assert.deepEqual(saved.map(r=>r.tip_menu),[true,false,null]);assert.deepEqual(saved.map(r=>r.amount),[300,100,500]);
});
