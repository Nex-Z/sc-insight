const hints=new Map();
export function rememberSnapshot(model){
 const id=String(model.id);if(!/^[1-9]\d*$/.test(id))return null;
 const raw=model.snapshotTimestamp,stamp=typeof raw==='string'&&/^\d+$/.test(raw)?Number(raw):raw;const url=model.status==='public'&&Number.isSafeInteger(stamp)&&stamp>0?`https://img.doppiocdn.net/thumbs/${stamp}/${id}`:null;
 if(hints.size>=12000&&!hints.has(id))hints.delete(hints.keys().next().value);hints.set(id,{url,at:Date.now()});return url;
}
export function snapshotHint(id){const item=hints.get(String(id));return item&&Date.now()-item.at<120000?item.url:null;}
