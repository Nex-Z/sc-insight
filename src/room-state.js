const labels={public:'公开直播',ticketShow:'开票直播',groupShow:'群组直播（计费类型未确认）',paidGroupShow:'付费群组直播',private:'私聊中',p2p:'独占私聊中',offline:'已离线',idle:'空闲 / 开播状态待确认',away:'暂离',unknown:'状态未确认'};
export const roomLabel=status=>labels[status]||`状态未确认（${status||'unknown'}）`;
export function classifyRoom(user,cam={},source='cam'){
 const raw=user?.status;let status=raw==='off'?'offline':raw,online=null;
 const show=cam.show;const currentShow=show&&!show.isDeleted&&!show.endedAt&&String(show.modelId)===String(user?.id);
 if(status==='groupShow'&&currentShow&&show.mode==='groupShow'){
  if(show.details?.groupShow?.type==='ticket')status='ticketShow';
  else if(show.details?.groupShow?.type==='group')status='paidGroupShow';
 }
 if(status==='offline')online=false;
 else if(['public','private','p2p','groupShow','ticketShow','paidGroupShow','away'].includes(status))online=true;
 else if(status!=='idle')status='unknown';
 const recordable=status==='public'&&cam.isCamAvailable===true&&!user?.isBlocked&&!user?.isDeleted;
 return {status,online,recordable,raw_status:raw||null,label:roomLabel(status),source,
  show_type:currentShow?show.details?.groupShow?.type||show.mode||null:null,show_id:currentShow?String(show.id):null,
  reason:recordable?'公开直播可录制':status==='public'?'公开房间的视频当前不可用':roomLabel(status)};
}
export function recordingInterruption(model){
 const status=model.room_status;
 if(['ticketShow','paidGroupShow','groupShow','private','p2p','away'].includes(status))return {code:status,reason:`转为${roomLabel(status)}，公开视频不可录制；已保留此前片段`};
 if(status==='offline'||status==='off')return {code:'offline',reason:'已观察到主播离线，保留此前片段'};
 if(status==='public'&&model.room_details?.recordable===false)return {code:'public_unavailable',reason:'公开房间视频不可用，已保留此前片段；不计为离线'};
 return {code:'observation_gap',reason:'房间状态或连续采样不可确认，已保留片段；不计为离线'};
}
