// Inputs are hourly aggregates in Asia/Hong_Kong, never browser-local time.
export function activitySummary(hours, observations, starts, today){
 const daily=[];const end=Date.parse(today+'T00:00:00Z');
 for(let n=364;n>=0;n--)daily.push({day:new Date(end-n*86400000).toISOString().slice(0,10),seconds:0,samples:0,starts:0,partial:0});
 const byDay=new Map(daily.map(d=>[d.day,d]));
 const grid=Array.from({length:168},(_,i)=>({weekday:Math.floor(i/24),hour:i%24,seconds:0,starts:0,samples:0}));
 const cell=(day,hour)=>grid[((new Date(day+'T00:00:00Z').getUTCDay()+6)%7)*24+Number(hour)];
 for(const h of hours){const d=byDay.get(h.day);if(d){d.seconds+=Number(h.seconds);cell(h.day,h.hour).seconds+=Number(h.seconds);}}
 for(const o of observations){const d=byDay.get(o.day);if(d){d.samples+=Number(o.samples);cell(o.day,o.hour).samples+=Number(o.samples);}}
 for(const s of starts){const d=byDay.get(s.day);if(d){d.starts+=Number(s.starts);d.partial+=Number(s.partial);cell(s.day,s.hour).starts+=Number(s.starts);}}
 return {daily,hours:grid,timezone:'Asia/Hong_Kong'};
}
