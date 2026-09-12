import {resolvePublicSource} from './public-source.js';
import {sourceUrl,probe} from './media.js';
import {createSourceRelay} from './source-relay.js';

// Numeric input always means the upstream ID, never the database primary key.
export async function findRecordingTarget(db,target){
 if(typeof target!=='string'||! /^[\w-]{1,80}$/.test(target.trim()))throw new Error('请输入主播名称或平台 ID');
 target=target.trim();
 const numeric=/^\d+$/.test(target);
 const {rows:[model]}=await db.query(numeric?'SELECT * FROM models WHERE source_id=$1':'SELECT * FROM models WHERE lower(name)=lower($1)',[target]);
 if(model)return model;
 if(numeric)throw new Error('尚未收录这个平台 ID，请先使用主播名称');
 return {name:target};
}

export async function resolveModelInput(model,{resolver=resolvePublicSource,prober=probe,relayFactory=createSourceRelay}={}){
 let expectedId=model.source_id;
 async function resolve(){
  const source=await resolver(model.name);
  if(expectedId&&String(source.modelId)!==String(expectedId))throw new Error('公开直播间的 ID 与目标主播不匹配');
  if(source.status!=='resolved')throw new Error(source.reason||'当前直播格式尚不支持 HTTP 直拉');
  expectedId=source.modelId;
  sourceUrl(source.url);return source;
 }
 const source=await resolve(),relay=await relayFactory(source,{refresh:resolve});
 const input={url:relay.url,method:'GET',headers:{Referer:source.pageUrl},modelId:source.modelId,name:source.name||model.name,close:()=>relay.close()};
 try{const info=await prober(input.url,true,input);return {...input,streams:info?.streams};}catch(e){relay.close();throw e;}
}
