export function currentBroadcast(sessions,model,refreshSeconds,now=Date.now()){
 if(!model.fresh||!model.online)return null;
 const latest=sessions?.[0];if(!latest||latest.ended_at)return null;
 const age=now-Date.parse(latest.last_seen);return Number.isFinite(age)&&age>=-5000&&age<=Math.max(20,refreshSeconds*3)*1000?latest:null;
}
