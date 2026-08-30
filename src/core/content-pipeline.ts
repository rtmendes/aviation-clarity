export const CONTENT_TYPES=['youtube','podcast','article','short','social','carousel','email','lead_magnet','quiz','worksheet'] as const;
export type ContentType=typeof CONTENT_TYPES[number];
export type ContentPackage={topic:string;sourceBrief:string;approved:boolean;assets:Partial<Record<ContentType,string>>};

export function createContentPlan(topic:string):ContentPackage{
 return {topic,sourceBrief:'',approved:false,assets:{}};
}

export function canPublish(pkg:ContentPackage):boolean{return pkg.approved && pkg.sourceBrief.trim().length>0;}
