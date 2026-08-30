export type Sensitivity = 'general' | 'technical' | 'regulatory' | 'safety' | 'medical';
export type WorkflowStatus = 'queued' | 'researching' | 'verified' | 'generating' | 'qa' | 'approved' | 'published' | 'blocked';
export type ContentType = 'lesson' | 'youtube' | 'podcast' | 'article' | 'short' | 'email' | 'social' | 'lead-magnet' | 'book-chapter';

export type Topic = { id:string; title:string; audience:string; pillar:string; sensitivity:Sensitivity; priority:number; status:WorkflowStatus; };
export type ResearchSource = { id:string; title:string; url:string; authority:string; verifiedAt?:string; };
export type LearningModel = { simple:string; analogy:string; visual:string; scenario:string; memoryHook:string; retrievalQuestions:string[]; instructorPrompt:string; };
export type ContentAsset = { id:string; topicId:string; type:ContentType; status:WorkflowStatus; body:string; qa:string[]; };
export type AgentRun = { id:string; agent:string; status:WorkflowStatus; startedAt:string; output?:unknown; };
