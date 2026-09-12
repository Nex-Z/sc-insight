import 'dotenv/config';
import {resolvePublicSource} from './public-source.js';
const name=process.argv[2];
if(!name){console.error('用法: npm run source:check -- 主播名称');process.exitCode=1;}
else try{const source=await resolvePublicSource(name);console.log(JSON.stringify(source,null,2));if(source.status!=='resolved')process.exitCode=2;}
catch(e){console.error(e.message);process.exitCode=1;}
