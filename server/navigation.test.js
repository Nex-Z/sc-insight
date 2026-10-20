import test from 'node:test';
import assert from 'node:assert/strict';
import {readRoute,navigate,replaceRoute,returnToOrigin} from '../src/navigation.js';

test('routes preserve creator, deep content path and encoded search independently',()=>{
 const route=readRoute('#detail/65/content/recording/143?q=nide%20laoshi&sort=oldest');
 assert.equal(route.page,'detail');assert.equal(route.id,65);
 assert.deepEqual(route.parts.slice(2),['content','recording','143']);
 assert.equal(route.params.get('q'),'nide laoshi');
 assert.equal(readRoute('#library?model=65').params.get('model'),'65');
 assert.equal(readRoute('').page,'dashboard');
});

test('detail tabs replace their entry and return restores the filtered origin and scroll',()=>{
 const saved=Object.fromEntries(['location','history','window','HashChangeEvent'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const entries=[{hash:'#models?q=nide&sort=name',state:null}],events=[];
 let cursor=0;
 try{
  globalThis.location={hash:entries[0].hash};
  globalThis.window={scrollY:850,scrollTo:(x,y)=>{window.scrollY=y;},dispatchEvent:e=>events.push(e.type)};
  globalThis.HashChangeEvent=class{constructor(type){this.type=type;}};
  globalThis.history={
   get state(){return entries[cursor].state;},
   replaceState(state,title,url){entries[cursor]={state,hash:url||location.hash};if(url)location.hash=url;},
   pushState(state,title,url){entries.splice(++cursor);entries.push({state,hash:url});location.hash=url;},
   back(){cursor--;location.hash=entries[cursor].hash;window.scrollY=entries[cursor].state.scrollY;},
  };
  navigate('detail/65');assert.equal(window.scrollY,0);
  replaceRoute('detail/65/highlights');assert.equal(entries.length,2);
  assert.equal(history.state.returnTo,'#models?q=nide&sort=name');
  returnToOrigin();assert.equal(location.hash,'#models?q=nide&sort=name');assert.equal(window.scrollY,850);
  navigate('library?model=65');assert.equal(readRoute().params.get('model'),'65');
  assert.deepEqual(events,['hashchange','hashchange','hashchange']);
 }finally{for(const [key,descriptor] of Object.entries(saved)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
