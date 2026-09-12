// Only replay headers actually observed on the selected browser request.
export function captureInputArgs(candidate) {
 if(candidate.method!=='GET')throw new Error('仅支持 GET 媒体录制');
 const result=[],lines=[];
 for(const [raw,value] of Object.entries(candidate.headers||{})){
  const key=raw.toLowerCase();
  if(key.startsWith(':'))continue; // HTTP/2 pseudo headers are transport metadata.
  if(!/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(key)||/[\r\n\0]/.test(String(value)))throw new Error('请求头包含无效字符');
  if(['host','connection','content-length','transfer-encoding','accept-encoding','range','if-range','if-none-match','if-modified-since'].includes(key)||key.startsWith('sec-'))continue;
  if(key==='user-agent'){result.push('-user_agent',String(value));continue;}
  if(key==='referer'){result.push('-referer',String(value));continue;}
  if(key==='cookie'){
   // FFmpeg's cookie jar scopes cookies to the observed host instead of sending
   // an unscoped Cookie header to every host referenced by an HLS manifest.
   // FFmpeg matches against the HTTP authority, including a non-default port.
   const host=new URL(candidate.url).host;
   result.push('-cookies',String(value).split(/;\s*/).map(c=>`${c}; path=/; domain=${host};`).join('\n'));continue;
  }
  lines.push(`${raw}: ${value}`);
 }
 if(lines.length)result.push('-headers',lines.join('\r\n')+'\r\n');
 if(result.join(' ').length>24000)throw new Error('会话请求头过长，无法安全传给 FFmpeg');
 return result;
}
