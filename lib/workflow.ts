import type { WorkflowStatus } from './types';

export const workflow: WorkflowStatus[] = [
  'queued',
  'researching',
  'verified',
  'generating',
  'qa',
  'approved',
  'published',
];

export function canAdvance(from: WorkflowStatus, to: WorkflowStatus): boolean {
  const i = workflow.indexOf(from);
  const j = workflow.indexOf(to);
  if (to === 'blocked') return from !== 'published';
  return i >= 0 && j === i + 1;
}

export function nextStatus(status: WorkflowStatus): WorkflowStatus {
  const i = workflow.indexOf(status);
  if (i < 0) return status;
  return workflow[i + 1] ?? status;
}
