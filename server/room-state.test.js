import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyRoom,recordingInterruption} from '../src/room-state.js';
import {inspectRoomState} from './room-state.js';
const model={id:1,status:'groupShow',username:'fixture'};
const show=type=>({modelId:1,id:9,mode:'groupShow',endedAt:null,isDeleted:false,details:{groupShow:{type}}});
test('explicit current ticket evidence distinguishes tickets from generic group shows',()=>{
 assert.equal(classifyRoom(model,{show:show('ticket'),isCamAvailable:false}).status,'ticketShow');
 assert.equal(classifyRoom(model,{show:show('group')}).status,'paidGroupShow');
 for(const s of [null,{...show('ticket'),endedAt:'2020-01-01'},{...show('ticket'),isDeleted:true},{...show('ticket'),modelId:2},show('future')])assert.equal(classifyRoom(model,{show:s}).status,'groupShow');
});
test('availability, active flag and account isOnline do not determine true offline',()=>{
 for(const status of ['private','p2p','groupShow']){const r=classifyRoom({...model,status},{isCamAvailable:false});assert.equal(r.online,true);assert.equal(r.recordable,false);}
 assert.equal(classifyRoom({...model,status:'off',isOnline:true},{isCamActive:true}).online,false);
 for(const status of ['idle','virtualPrivate','future'])assert.equal(classifyRoom({...model,status}).online,null);
 const r=classifyRoom({...model,status:'public'},{isCamAvailable:false});assert.equal(r.online,true);assert.equal(r.recordable,false);
});
test('highlights carry the specific unrecordable room reason rather than offline',()=>{
 const r=recordingInterruption({room_status:'ticketShow'});assert.equal(r.code,'ticketShow');assert.match(r.reason,/开票/);assert.doesNotMatch(r.reason,/离线/);
 assert.equal(recordingInterruption({room_status:'p2p'}).code,'p2p');assert.equal(recordingInterruption({room_status:'unknown'}).code,'observation_gap');
});
test('room endpoint validates identity and excludes stream credentials from persisted evidence',async()=>{
 const result=await inspectRoomState({name:'fixture',source_id:'1'},{fetcher:async()=>Response.json({user:{user:model},cam:{show:show('ticket'),modelToken:'secret',userToken:'secret'}})});
 assert.equal(result.status,'ticketShow');assert.equal(JSON.stringify(result).includes('secret'),false);
 await assert.rejects(inspectRoomState({name:'wrong',source_id:'1'},{fetcher:async()=>Response.json({user:{user:model},cam:{}})}));
});
