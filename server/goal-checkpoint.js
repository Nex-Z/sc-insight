import {observeGoal} from './goal-detection.js';

function meaningful(state){const {at,...rest}=state||{};return JSON.stringify(rest);}
export function goalCheckpoint(previous,goal,now,nearPercent,checkpointMs=30000){
 const result=observeGoal(previous?.state,goal,now,nearPercent);
 const persist=!previous||!!previous.error||result.signals.length>0||
  meaningful(result.state)!==meaningful(previous.savedState)||now-previous.savedAt>=checkpointMs;
 return {result,persist};
}
export function goalInterval(model){return model.online===false?120000:5000;}
