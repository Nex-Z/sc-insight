import {inspectRoomState} from './room-state.js';
import {recordingInterruption} from '../src/room-state.js';
import {requestMediaStop} from './media-archive.js';

export async function checkRecordingRoom(job,model,{inspect=inspectRoomState}={}){
 if(job.checkingRoom||job.closed||job.stopRequested)return;
 job.checkingRoom=true;
 try{
  const room=await inspect(model);
  if(!job.closed&&!job.stopRequested&&!room.recordable&&!['unknown','idle'].includes(room.status))
   requestMediaStop(job,{reason:recordingInterruption({room_status:room.status,room_details:room}).reason});
 }catch{/* A failed observation is not proof that the public stream ended. */}
 finally{job.checkingRoom=false;}
}

// A failed status request never becomes an offline observation.
export async function reconcileLiveTarget(model,{inspect,active,eligible,start,stop,observe}){
 const room=await inspect(model.name);
 if(String(room.modelId)!==String(model.source_id))throw new Error('主播 ID 不匹配');
 await observe(room);
 const tasks=await active();
 if(!room.live){for(const task of tasks)await stop(task.id,room);return 'waiting';}
 if(!tasks.length&&await eligible()){await start();return 'started';}
 return 'watching';
}
