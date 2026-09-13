export function observeGoal(previous,goal,now,nearPercent=1){
 const old=previous||{cycle:0};
 if(!goal||!Number.isFinite(goal.target)||goal.target<=0||!Number.isFinite(goal.spent)||goal.spent<0)return {state:{...old,at:now,available:false},signals:[]};
 const key=JSON.stringify([goal.id??null,goal.description,goal.target]);
 const reset=old.key!==key||goal.spent<old.spent&&goal.spent<goal.target*(1-nearPercent/100);
 const state=reset?{key,cycle:(old.cycle||0)+1,near:false,completed:false}: {...old};
 const continuous=!reset&&old.available!==false&&now-old.at<=30000;
 const remaining=Math.max(0,(goal.target-goal.spent)/goal.target*100),signals=[];
 const base={cycle:state.cycle,goalKey:key,description:goal.description,target:goal.target,spent:goal.spent,at:now};
 // A jump straight over the near threshold is one completion event, not two alerts.
 if(goal.spent>=goal.target){
  if(!state.completed&&continuous&&old.spent<goal.target){state.completionAt=now;signals.push({...base,kind:'goalComplete',text:`目标已完成：${goal.description||'当前目标'}（${old.spent} → ${goal.spent} / ${goal.target} TK）`});}
  state.completed=true;
 }else if(remaining<=nearPercent&&!state.near){state.near=true;signals.push({...base,kind:'goalNear',text:`目标仅剩 ${Number(remaining.toFixed(2))}%：${goal.description||'当前目标'}`});}
 return {state:{...state,at:now,available:true,spent:goal.spent,goal,remaining},signals};
}

export function mergeHighlightWindow(current,reasons,now,{recordedThrough=0,bufferStart=0}={}){
 const h=current?{...current,reasons:[...current.reasons],pendingGoals:{...current.pendingGoals}}:{start:Math.max(now-120000,recordedThrough,bufferStart),end:now+180000,reasons:[],pendingGoals:{},goalTail:0};
 const merged=new Map(h.reasons.map(r=>[r.kind+(r.cycle??''),r]));
 for(const r of reasons){merged.set(r.kind+(r.cycle??''),r);
  if(r.kind==='goalNear')h.pendingGoals[r.cycle]={key:r.goalKey,at:r.at};
  if(r.kind==='goalComplete'){delete h.pendingGoals[r.cycle];h.goalTail=Math.max(h.goalTail||0,r.at+900000);}
 }
 h.reasons=[...merged.values()];
 h.end=Math.max(h.end,Math.min(now+180000,h.start+900000),h.goalTail||0);
 return h;
}
