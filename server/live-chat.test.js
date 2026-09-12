import test from 'node:test';
import assert from 'node:assert/strict';
import {chatMessage} from './live-chat.js';
test('chat normalizes plain text and excludes deleted or non-message events',()=>{
 const m={id:12,details:{body:'<script>alert(1)</script>'},userData:{username:'guest'}};
 assert.equal(chatMessage(m).text,m.details.body);
 assert.equal(chatMessage({...m,isDeleted:true}),null);
 assert.equal(chatMessage({id:13,details:{}}),null);
 assert.equal(chatMessage({...m,details:{body:'a'.repeat(3000)}}).text.length,2000);
});
