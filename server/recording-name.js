import path from 'node:path';
function safeUsername(username){
 const name=String(username||'主播').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,80).replace(/[. ]+$/g,'')||'主播';
 return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)?'_'+name:name;
}
export function recordingDirectory(root,username){
 const base=path.resolve(root),directory=path.join(base,safeUsername(username));
 if(path.dirname(directory)!==base)throw new Error('主播录像目录无效');
 return directory;
}
export function recordingFilename(username,date=new Date()){
 const name=safeUsername(username);
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
 return `${name}-${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}-${String(date.getUTCMilliseconds()).padStart(3,'0')}.mp4`;
}
