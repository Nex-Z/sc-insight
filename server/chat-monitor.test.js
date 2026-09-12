import test from 'node:test';
import assert from 'node:assert/strict';
import {chatMessage} from './live-chat.js';
test('public tips preserve amounts and anonymous tips do not expose user IDs',()=>{
 const result=chatMessage({id:12,type:'tip',details:{amount:25,isAnonymous:true},userData:{id:77,username:'hidden'}});
 assert.equal(result.amount,25);assert.equal(result.userId,null);assert.equal(result.text,'');
 assert.equal(chatMessage({id:13,type:'tip',details:{amount:'25'}}).amount,null);
});
