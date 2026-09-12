// A failed status request never becomes an offline observation.
export async function reconcileLiveTarget(model,{inspect,active,eligible,start,stop,observe}){
 const room=await inspect(model.name);
 if(String(room.modelId)!==String(model.source_id))throw new Error('主播 ID 不匹配');
 await observe(room);
 const tasks=await active();
 if(!room.live){for(const task of tasks)await stop(task.id);return 'waiting';}
 if(!tasks.length&&await eligible()){await start();return 'started';}
 return 'watching';
}
