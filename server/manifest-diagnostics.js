export function describeManifest(body){
 const lines=body.split(/\r?\n/).map(l=>l.trim());
 const customTags=lines.filter(l=>l.startsWith('#EXT-X-MOUFLON:'));
 const references=lines.filter(l=>l&&!l.startsWith('#'));
 const customTypes=[...new Set(customTags.map(l=>l.split(':')[1]))];
 const placeholderReferences=references.filter(l=>/(?:^|\/)media\.mp4(?:\?|$)/.test(l)).length;
 const ended=lines.includes('#EXT-X-ENDLIST');
 return {isHls:lines[0]==='#EXTM3U',bytes:Buffer.byteLength(body),master:lines.some(l=>l.startsWith('#EXT-X-STREAM-INF:')),ended,mediaSequence:Number(body.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1]||0),customTypes,placeholderReferences,referenceCount:references.length,needsAddressAdapter:customTypes.includes('URI')||customTypes.includes('FILE')||placeholderReferences>0,duration:[...body.matchAll(/#EXTINF:([\d.]+)/g)].reduce((total,m)=>total+Number(m[1]),0)};
}
export function replayHeaders(headers){
 return Object.fromEntries(Object.entries(headers).filter(([key])=>!key.startsWith(':')&&!['host','connection','content-length','accept-encoding'].includes(key.toLowerCase())));
}
