// Bound queued + in-flight messages; retain original receive times when batching.
export function createMessageBuffer(write,{delay=1000,size=50,limit=500,onError=()=>{}}={}){
 let batch=[],pending=0,timer,tail=Promise.resolve(),closed=false,failure;
 function flush(){
  clearTimeout(timer);timer=null;
  if(!batch.length)return tail;
  const messages=batch;batch=[];
  tail=tail.then(async()=>{
   try{await write(messages);}catch(e){failure=e;onError(e);}finally{pending-=messages.length;}
  });return tail;
 }
 return {
  add(message){
   if(closed||failure||pending>=limit)return false;
   batch.push({...message,receivedAt:message.receivedAt||new Date().toISOString()});pending++;
   if(batch.length>=size||message.type==='tip')void flush();
   else if(!timer)timer=setTimeout(()=>void flush(),delay);
   return true;
  },
  flush,
  async close(){closed=true;await flush();if(failure)throw failure;},
  get pending(){return pending;}
 };
}
