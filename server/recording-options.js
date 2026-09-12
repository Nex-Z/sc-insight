export function recordingConcurrency(value=process.env.RECORDING_CONCURRENCY){
 const n=Number(value??2);
 if(!Number.isInteger(n)||n<1||n>32)throw new Error('RECORDING_CONCURRENCY 必须是 1 至 32 的整数');
 return n;
}
export function recordingCodecArgs(transcode=process.env.RECORDING_TRANSCODE==='1'){
 // Live capture normally remuxes packets; encoding is an explicit opt-in.
 return transcode?['-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2','-threads','2','-c:a','aac','-b:a','128k']:['-c','copy'];
}
export function recordingDurationArgs(record){return record.until_offline?[]:['-t',String(record.max_seconds)];}
