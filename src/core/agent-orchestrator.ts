export type AgentName =
  | 'research-scout'
  | 'source-verifier'
  | 'learning-architect'
  | 'aviation-translator'
  | 'memory-designer'
  | 'cfi-lesson-architect'
  | 'content-factory'
  | 'product-architect'
  | 'funnel-architect'
  | 'seo-strategist'
  | 'visual-director'
  | 'qa-guardian'
  | 'repurposing-agent'
  | 'analytics-agent'
  | 'orchestrator';

export type WorkflowStage =
  | 'intake'
  | 'research'
  | 'verify'
  | 'transform'
  | 'generate'
  | 'qa'
  | 'approve'
  | 'publish'
  | 'measure'
  | 'learn';

export type JobStatus = 'queued' | 'running' | 'blocked' | 'complete';

export type Job = {
  id: string;
  topic: string;
  stage: WorkflowStage;
  agents: AgentName[];
  status: JobStatus;
  errors: string[];
};

export const stageOrder: WorkflowStage[] = [
  'intake',
  'research',
  'verify',
  'transform',
  'generate',
  'qa',
  'approve',
  'publish',
  'measure',
  'learn',
];

export function nextStage(stage: WorkflowStage): WorkflowStage | null {
  const i = stageOrder.indexOf(stage);
  if (i < 0 || i === stageOrder.length - 1) return null;
  return stageOrder[i + 1] ?? null;
}

export function createJob(topic: string): Job {
  return {
    id: crypto.randomUUID(),
    topic,
    stage: 'intake',
    agents: ['orchestrator'],
    status: 'queued',
    errors: [],
  };
}

/**
 * Advances a job one stage. The `qa` stage is a hard gate: without explicit
 * approval the job is blocked rather than promoted toward publication.
 */
export function transition(job: Job, approved = false): Job {
  if (job.stage === 'qa' && !approved) {
    return {
      ...job,
      status: 'blocked',
      errors: [...job.errors, 'QA approval required before publication'],
    };
  }
  const next = nextStage(job.stage);
  if (!next) return { ...job, status: 'complete' };
  return { ...job, stage: next, status: 'queued' };
}
