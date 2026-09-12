import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pool} from './db.js';
const defaultDirectory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../storage/recordings');
export async function getStorage(){const result=await pool.query("SELECT value FROM settings WHERE key='storage'");const directory=result.rows[0]?.value.directory||defaultDirectory;await fs.mkdir(directory,{recursive:true});let space=null;try{const s=await fs.statfs(directory);space={total:s.blocks*s.bsize,available:s.bavail*s.bsize};}catch{}return {directory,space};}
export async function saveStorage(directory){if(typeof directory!=='string'||!path.isAbsolute(directory)||directory.length>1000)throw new Error('请输入有效的绝对目录路径');const resolved=path.resolve(directory);await fs.mkdir(resolved,{recursive:true});await fs.access(resolved,fs.constants.W_OK);await pool.query("INSERT INTO settings(key,value) VALUES('storage',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[{directory:resolved}]);return getStorage();}
