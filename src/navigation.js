export function readRoute(hash=globalThis.location?.hash||''){
 const [path,query='']=hash.replace(/^#/,'').split('?');
 const parts=(path||'dashboard').split('/');
 return {page:parts[0],id:Number(parts[1])||null,parts,params:new URLSearchParams(query)};
}
export function navigate(target){
 const hash='#'+target.replace(/^#/,'');
 if(location.hash===hash)return;
 history.replaceState({...history.state,scrollY:window.scrollY},'');
 const from=location.hash||'#dashboard';
 history.pushState({returnTo:from},'',hash);
 window.dispatchEvent(new HashChangeEvent('hashchange'));
 window.scrollTo(0,0);
}
export function returnToOrigin(){
 const from=history.state?.returnTo;
 if(typeof from==='string'&&from.startsWith('#'))history.back();
 else navigate('models');
}
export function replaceRoute(target){
 history.replaceState(history.state,'','#'+target.replace(/^#/,''));
 window.dispatchEvent(new HashChangeEvent('hashchange'));
}
