import test from 'node:test';
import assert from 'node:assert/strict';
import {chatMessage} from './live-chat.js';
test('public tips preserve amounts and anonymous tips do not expose user IDs',()=>{
 const result=chatMessage({id:12,type:'tip',details:{amount:25,isAnonymous:true},userData:{id:77,username:'hidden'}});
 assert.equal(result.amount,25);assert.equal(result.userId,null);assert.equal(result.text,'打赏 25 TK');
 assert.equal(chatMessage({id:13,type:'tip',details:{amount:'25'}}).amount,null);
});

test('structured events have visible content and preserve distinct event types',()=>{const tip=chatMessage({id:1,type:'privateTip',details:{body:'',amount:5,isAnonymous:true},userData:{id:9,userRanking:{level:95},isModel:true}});assert.equal(tip.text,'打赏 5 TK');assert.equal(tip.type,'privateTip');assert.equal(tip.level,null);assert.deepEqual(tip.badges,[]);assert.equal(tip.role,'anonymous');assert.equal(chatMessage({id:2,type:'lovense',details:{lovenseDetails:{type:'tip'}}}).text,'设备互动');assert.equal(chatMessage({id:3,type:'unknown',details:{}}).text,'互动事件（内容暂不支持）');assert.equal(chatMessage({id:4,type:'text',details:{body:'  '}}),null);});
test('host identity and user rank come from upstream fields',()=>{const host=chatMessage({id:1,modelId:4,type:'text',details:{body:'hello'},userData:{id:4,isModel:true}});assert.equal(host.role,'host');const user=chatMessage({id:2,type:'text',details:{body:'hi',fanClubTier:'tier3'},userData:{id:8,userRanking:{league:'gold',level:36}},additionalData:{isKnight:true}});assert.equal(user.level,36);assert.ok(user.badges.includes('粉丝团'));});
