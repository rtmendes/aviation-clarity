import type { LearningModel, Sensitivity } from './types';

const bannedOperational = [/fly\s+through/i,/ignore\s+(the\s+)?checklist/i,/continue\s+despite/i];

export function buildLearningModel(topic:string, sensitivity:Sensitivity='technical'):LearningModel {
  const simple = `Core idea: ${topic}. Explain what it is, why it matters, and what changes when the relevant conditions change.`;
  const analogy = `Analogy: connect ${topic} to a familiar everyday system, then explicitly state where the analogy stops being accurate.`;
  const visual = `Visual model: show inputs → process → outcome, with the key variables labeled.`;
  const scenario = `Scenario: present a realistic training situation, ask the learner to predict the outcome, then reveal the reasoning.`;
  const memoryHook = `Memory hook: ${topic.split(/\s+/).slice(0,5).join(' ')} → meaning → consequence.`;
  const retrievalQuestions = [
    `What is the central concept behind ${topic}?`,
    `What variable or condition changes the result?`,
    `How would you explain ${topic} to another learner in 30 seconds?`,
    `What common misconception should a learner avoid?`
  ];
  const instructorPrompt = sensitivity==='safety'||sensitivity==='regulatory'
    ? 'Use this as an instructional aid only; verify current authoritative guidance and applicable aircraft/operation-specific information before operational use.'
    : 'Ask the learner to explain the concept back in their own words and identify the condition that would change the answer.';
  return {simple,analogy,visual,scenario,memoryHook,retrievalQuestions,instructorPrompt};
}

export function safetyScan(text:string){
  const flags = bannedOperational.filter(r=>r.test(text)).map(r=>`Potential unsafe operational instruction: ${r.source}`);
  return {blocked:flags.length>0, flags};
}
