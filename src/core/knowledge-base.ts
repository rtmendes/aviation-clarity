import type {Claim,SourceRecord} from './research-registry';
export type KnowledgeUnit={id:string;topic:string;summary:string;claims:Claim[];sources:SourceRecord[];status:'draft'|'verified'|'review'|'approved'};
export function createKnowledgeUnit(topic:string,summary:string):KnowledgeUnit{return {id:crypto.randomUUID(),topic,summary,claims:[],sources:[],status:'draft'};}
export function refreshStatus(unit:KnowledgeUnit):KnowledgeUnit{
 const allVerified=unit.claims.length>0&&unit.claims.every(c=>c.verified&&c.sourceIds.every(id=>unit.sources.some(s=>s.id===id)));
 return {...unit,status:allVerified?'verified':'draft'};
}
