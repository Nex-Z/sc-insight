import React from 'react';
import {ExternalLink} from 'lucide-react';

export default function WatchLiveLink({model}){
 return <a className="watch-live-link" href={`https://stripchat.com/${encodeURIComponent(model.name)}`} target="_blank" rel="noopener noreferrer" title="在新标签页打开官网直播间，观看直播和聊天" aria-label={`去官网看 ${model.name} 的直播`}><ExternalLink size={18}/>前往官网</a>;
}
