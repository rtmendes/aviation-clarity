export type LifeBlock='flight_training'|'work'|'family'|'sleep'|'health'|'admin'|'travel'|'recovery'|'personal';
export type LifeEvent={id:string;title:string;start:string;end:string;block:LifeBlock;priority:1|2|3;flexible:boolean};
export function detectConflicts(events:LifeEvent[]){const sorted=[...events].sort((a,b)=>a.start.localeCompare(b.start));const conflicts:{a:string;b:string}[]=[];for(let i=1;i<sorted.length;i++)if(sorted[i].start<sorted[i-1].end)conflicts.push({a:sorted[i-1].id,b:sorted[i].id});return conflicts;}
export function weeklyLoad(events:LifeEvent[]){return events.reduce<Record<string,number>>((out,e)=>{const day=e.start.slice(0,10);out[day]=(out[day]??0)+Math.max(0,(Date.parse(e.end)-Date.parse(e.start))/3600000);return out;},{});}
