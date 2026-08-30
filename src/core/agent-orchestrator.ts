export type AgentName='research-scout'|'source-verifier'|'learning-architect'|'aviation-translator'|'memory-designer'|'cfi-lesson-architect'|'content-factory'|'product-architect'|'funnel-architect'|'seo-strategist'|'visual-director'|'qa-guardian'|'repurposing-agent'|'analytics-agent'|'orchestrator';
export type WorkflowStage='intake'|'research'|'verify'|'transform'|'generate'|'qa'|'approve'|'publish'|'measure'|'learn';
export type Job={id:string;topic:string;stage:WorkflowStage;agents:AgentName[];status:'queued'|'running'|'blocked'|'complete';errors:string[]};

const order:WorkflowStage[]=['intake','research','verify','transform','generate','qa','approve','publish','measure','learn'];
export function nextStage(stage:WorkflowStage):WorkflowStage|null{const i=order.indexOf(stage);return i<0||i===order.length-1?null:order[i+1];}
export function createJob(topic:string):Job{return {id:crypto.randomUUID(),topic,stage:'intake',agents:['orchestrator'],status:'queued',errors:[]};}
export function transition(job:Job,approved=false):Job{
 const next=nextStage(job.stage); if(!next)return {...job,status:'complete'};
 if(job.stage==='qa'&&!approved)return {...job,status:'blocked',errors:[...job.errors,'QA approval required before publication']};
 return {...job,stage:next,status:'queued'};
}
