const text=(v,max=2000)=>typeof v==='string'?v.slice(0,max):'';
const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const list=v=>Array.isArray(v)?v:[];
const photoUrl=v=>{try{const u=new URL(v);return u.protocol==='https:'&&(u.hostname==='static-proxy.strpst.com'||u.hostname.endsWith('.strpst.com'))?u.href:null;}catch{return null;}};
export function normalizeBackground(intro){
 if(intro?.type!=='image'||intro.isUnderPreModeration||intro.isProcessing)return null;
 const url=photoUrl(intro.image?.url);return url?{url,preview:photoUrl(intro.image?.thumbs?.thumb)||url,position:Math.max(0,Math.min(100,number(intro.settings?.heightShift)??50))}:null;
}
export function snapshotUrl(u,cam){return u.status==='public'&&cam?.isCamAvailable===true&&Number.isSafeInteger(u.snapshotTimestamp)&&u.snapshotTimestamp>0&&/^\d+$/.test(String(u.id))?'https://img.doppiocdn.net/thumbs/'+u.snapshotTimestamp+'/'+u.id:null;}
export function publicIdentity(data,model){
 const u=data?.user?.user;
 if(!u||String(u.id)!==String(model.source_id)||u.username?.toLowerCase()!==model.name.toLowerCase())throw new Error('官网返回的主播身份不匹配');
 if(u.isBlocked||u.isDeleted||data.user.isGeoBanned||data.user.isProfileAvailable===false)throw new Error('该主播公开资料当前不可访问');
 return u;
}
export function normalizeGoal(goal,live){
 if(!live||goal?.isEnabled!==true||!(number(goal.goal)>0))return null;
 const spent=number(goal.spent);
 return {description:text(goal.description),target:goal.goal,spent,left:number(goal.left),percent:spent===null?null:Math.min(100,spent/goal.goal*100)};
}
export function normalizeMenu(menu){return {enabled:menu?.isEnabled===true,items:list(menu?.settings).slice(0,200).filter(x=>text(x.activity)&&number(x.price)!==null).map(x=>({activity:text(x.activity,500),price:x.price}))};}
export function normalizeMembers(data){
 if(!Array.isArray(data?.members))throw new Error('在线成员格式暂不支持');
 const seen=new Set();
 return {members:data.members.slice(0,1000).flatMap(row=>{const u=row?.user||row;if(!u?.id||!text(u.username)||u.isAnonymous||u.isInvisible||row.isAnonymous||row.isInvisible||seen.has(String(u.id)))return [];seen.add(String(u.id));return [{id:String(u.id),name:text(u.username,80),level:number(u.userRanking?.level),isModel:u.isModel===true,isUltimate:u.isUltimate===true}];}),guests:number(data.guests),truncated:data.members.length>1000};
}
export function normalizeProfile(u,profile,menu,reviews,albums){
 const p=profile?.item||u;
 return {name:text(p.name,100),bio:text(p.description,6000),statusText:text(u.offlineStatus),age:u.isAgeHidden?null:number(p.age),country:text(p.country,80),city:text(p.city,100),languages:list(p.languages).filter(x=>typeof x==='string').slice(0,20),gender:text(p.gender,30),bodyType:text(p.bodyType,50),hairColor:text(p.hairColor,50),eyeColor:text(p.eyeColor,50),level:number(u.userRanking?.level),league:text(u.userRanking?.league,40),followers:number(u.favoritedCount),rating:number(u.ratingPrivate),ratingCount:number(u.ratingPrivateUsers),menu:normalizeMenu(menu),
 reviews:reviews?{total:number(reviews.total),items:list(reviews.items).slice(0,20).map(r=>({id:String(r.id),author:text(r.userUsername,80)||'匿名用户',score:number(r.score),text:text(r.description,4000),at:text(r.ratedAt,40)}))}:null,
 albums:albums?{total:number(albums.totalItems),items:list(albums.albums).slice(0,40).filter(a=>!a.isDeleted&&a.accessMode==='free'&&a.cost===0&&!a.minFanClubTier).map(a=>({id:String(a.id),name:text(a.name,120),count:number(a.photosCount),photos:list(a.photos).filter(p=>p.status==='approved'&&!p.isDeleted&&!p.isHidden&&!p.isUnderPreModeration).slice(0,50).map(p=>({id:String(p.id),url:photoUrl(p.urlThumb||p.urlPreview),fullUrl:photoUrl(p.url)})).filter(p=>p.url)}))}:null};
}
export function createPublicInfo({fetcher=fetch,now=Date.now}={}){
 const cache=new Map(),pending=new Map();
 async function request(path,ttl=10000){
  const hit=cache.get(path);if(hit&&now()-hit.at<ttl)return hit.value;
  if(pending.has(path))return pending.get(path);
  const promise=(async()=>{const r=await fetcher('https://stripchat.com/api/front'+path,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`官网请求失败（HTTP ${r.status}）`);
   const reader=r.body.getReader();let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4*1024*1024)throw new Error('官网响应过大');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(path,{at:now(),value});return value;
  })();pending.set(path,promise);try{return await promise;}finally{pending.delete(path);}
 }
 async function cam(model){if(!/^\d+$/.test(String(model.source_id)))throw new Error('主播平台 ID 无效');const data=await request(`/v2/models/${model.source_id}/cam`);return {data,u:publicIdentity(data,model)};}
 return {
  async snapshot(model){const {u,data}=await cam(model);return {url:snapshotUrl(u,data.cam)};},
  async room(model){const {data,u}=await cam(model);const live=u.status==='public'&&data.cam?.isCamAvailable===true;let audience=null,audienceError=null;if(live)try{audience=normalizeMembers(await request(`/models/${model.source_id}/members`));}catch{audienceError='官网在线名单暂不可用';}
   return {live,goal:normalizeGoal(data.cam?.goal,live),audience,audienceError,updatedAt:new Date(now()).toISOString()};},
  async profile(model){const {u}=await cam(model);const id=model.source_id;const paths=[`/v2/users/${id}/profile`,`/v2/models/${id}/tip-menu/settings`,`/show/v2/models/${id}/reviews?offset=0&limit=20`,`/v2/users/${id}/albums?limit=40`,`/users/${id}/intros`];
   const results=await Promise.allSettled(paths.map(p=>request(p,300000)));const values=results.map(r=>r.status==='fulfilled'?r.value:null);
   const data=normalizeProfile(u,...values);data.background=normalizeBackground(values[4]);data.unavailable=['profile','menu','reviews','albums','background'].filter((_,i)=>results[i].status==='rejected');return {...data,updatedAt:new Date(now()).toISOString()};}
 };
}
