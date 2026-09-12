const cache=new Map(),loaded=new Map(),images=new Map();
function trim(map,max=300){if(map.size>=max)map.delete(map.keys().next().value);}
export async function snapshot(id){const hit=cache.get(id);if(hit&&Date.now()-hit.at<30000)return hit.promise;const promise=fetch(`/api/models/${id}/snapshot`,{signal:AbortSignal.timeout(10000)}).then(async r=>{if(!r.ok)return null;return (await r.json()).url||null;}).catch(()=>null);trim(cache);cache.set(id,{at:Date.now(),promise});return promise;}
export function loadedSnapshot(id){return loaded.get(id)||null;}
export function preloadSnapshot(id,url){
 if(!url)return Promise.resolve(null);if(loaded.get(id)===url)return Promise.resolve(url);if(images.has(url))return images.get(url);
 const promise=new Promise(resolve=>{const image=new Image();let timer;const finish=ok=>{clearTimeout(timer);image.onload=image.onerror=null;if(ok){trim(loaded);loaded.set(id,url);}resolve(ok?url:null);};image.referrerPolicy='no-referrer';image.onload=()=>finish(true);image.onerror=()=>finish(false);timer=setTimeout(()=>finish(false),10000);image.src=url;});
 trim(images);images.set(url,promise);void promise.finally(()=>images.delete(url));return promise;
}
