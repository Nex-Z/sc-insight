import {pool} from './db.js';
let concurrency=2;
export function validateHighlightCapacity(value){
 if(!Number.isInteger(value)||value<1||value>32)throw new Error('高光并发数须为 1–32 的整数');
 return value;
}
export const getHighlightLimit=()=>concurrency;
export function idleHighlightsToRelease(jobs,limit){let excess=jobs.size-limit;const ids=[];for(const [id,job] of [...jobs].reverse())if(excess>0&&!job.highlight){ids.push(id);excess--;}return ids;}
export async function loadHighlightCapacity(db=pool){const {rows}=await db.query("SELECT value FROM settings WHERE key='highlight_capacity'");concurrency=validateHighlightCapacity(rows[0]?.value?.concurrency??2);}
export async function saveHighlightCapacity(value,db=pool){const next=validateHighlightCapacity(value);await db.query("INSERT INTO settings(key,value) VALUES('highlight_capacity',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[{concurrency:next}]);concurrency=next;}
