export type SourceType='faa'|'regulation'|'government'|'manufacturer'|'school'|'academic'|'industry'|'other';
export type SourceRecord={id:string;title:string;url:string;type:SourceType;publishedAt?:string;checkedAt:string;claims:string[];authorityScore:number};
export type Claim={id:string;text:string;sourceIds:string[];risk:'low'|'medium'|'high';verified:boolean};
export function createSource(title:string,url:string,type:SourceType,claims:string[]=[]):SourceRecord{return {id:crypto.randomUUID(),title,url,type,checkedAt:new Date().toISOString(),claims,authorityScore:type==='faa'||type==='regulation'||type==='government'?1:.7};}
export function claimIsPublishable(c:Claim,sources:SourceRecord[]):boolean{return c.verified&&c.sourceIds.length>0&&c.sourceIds.every(id=>sources.some(s=>s.id===id));}
