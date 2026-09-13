// Parent-owned FFmpeg: even an abrupt server exit closes stdin and stops the writer.
import {spawn} from 'node:child_process';
const [binary,...args]=process.argv.slice(2);
const child=spawn(binary,args,{windowsHide:true,stdio:['pipe','ignore','pipe']});
let timer,stopping=false;
function stop(){if(stopping)return;stopping=true;child.stdin.write('q\n',()=>{});timer=setTimeout(()=>child.kill(),3000);}
child.stdin.on('error',()=>{});child.stderr.pipe(process.stderr);
child.on('error',e=>process.stderr.write(e.message));
child.on('close',code=>{clearTimeout(timer);process.exit(code??1);});
process.stdin.on('data',stop);process.stdin.on('end',stop);process.stdin.resume();
process.on('SIGTERM',stop);process.on('SIGINT',stop);
