// Group only standardized LL-HLS delivery directives. Other query parameters
// may identify different media or authorization and must remain distinct.
export function streamKey(candidate){
 if(candidate.kind!=='HLS')return `${candidate.method} ${candidate.url}`;
 const url=new URL(candidate.url);
 for(const key of ['_HLS_msn','_HLS_part','_HLS_skip'])url.searchParams.delete(key);
 return `${candidate.method} ${url.href}`;
}
export function groupStreams(candidates){
 const groups=new Map();
 for(const candidate of candidates){
  const groupKey=streamKey(candidate),previous=groups.get(groupKey);
  const latest=!previous||candidate.lastSeen>previous.lastSeen?candidate:previous;
  groups.set(groupKey,{...latest,groupKey,requestCount:(previous?.requestCount||0)+(candidate.count||1),versions:(previous?.versions||0)+1});
 }
 return [...groups.values()].sort((a,b)=>Number(b.recordable)-Number(a.recordable)||(b.score||0)-(a.score||0)||b.lastSeen-a.lastSeen);
}
export function captureView(candidates,{showAll=false,recommendedId}={}){
 const groups=groupStreams(candidates);
 const hasPlaylists=groups.some(c=>['HLS','DASH'].includes(c.kind)&&c.recordable);
 const visible=showAll?candidates.map(c=>({...c,groupKey:'raw:'+c.id,versions:1,requestCount:c.count||1})):groups.filter(c=>hasPlaylists?['HLS','DASH'].includes(c.kind):c.kind!=='segment');
 const recommended=visible.find(c=>c.id===recommendedId&&c.recordable)||visible.find(c=>c.recordable);
 return {visible,recommended,groupCount:groups.filter(c=>['HLS','DASH'].includes(c.kind)).length};
}
