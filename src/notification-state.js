export function notificationState({secure,available,permission,enabled,requesting}){
 if(!secure)return {title:'当前地址未启用 HTTPS',help:'NAS 的 HTTP 地址无法发送系统通知。请通过配置好证书的 HTTPS 地址访问；站内铃铛提醒仍可用。'};
 if(!available)return {title:'当前浏览器不支持系统通知',help:'请使用 Chrome / Edge 打开此地址。部分内置浏览器不提供系统通知功能；站内提醒不受影响。'};
 if(permission==='denied')return {title:'通知权限已被拒绝',help:'请在地址栏的网站权限中将“通知”改为允许，然后刷新页面。浏览器不会重复弹出授权框。'};
 if(requesting)return {title:'等待浏览器授权',action:'等待授权…',disabled:true};
 if(enabled&&permission==='granted')return {title:'已开启',action:'关闭通知',active:true};
 return {title:'尚未开启',action:'开启通知'};
}
