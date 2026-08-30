import type { WorkflowStatus } from './types';

export const workflow:WorkflowStatus[]=['queued','researching','verified','generating','qa','approved','published'];
export function canAdvance(from:WorkflowStatus,to:WorkflowStatus){
  const i=workflow.indexOf(from), j=workflow.indexOf(to);
  return j===i+1 || (to==='blocked' && from!=='published');
}
export function nextStatus(status:WorkflowStatus):WorkflowStatus { const i=workflow.indexOf(status); return i>=0&&i<workflow.length-1?workflow[i+1]:status; }
