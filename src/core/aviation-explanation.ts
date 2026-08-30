export type ExplanationRequest={concept:string;learner?:string;goal?:string;difficulty?:'beginner'|'intermediate'|'advanced'};
export type ExplanationResult={plainLanguage:string;technicalFrame:string;analogy:string;visualModel:string;scenario:string;memoryHook:string;retrievalQuestions:string[];instructorPrompt:string;safetyFlags:string[]};

export function buildExplanationPrompt(input:ExplanationRequest):string{
 const learner=input.learner??'student pilot'; const goal=input.goal??'understand and retain the concept'; const level=input.difficulty??'beginner';
 return [`Concept: ${input.concept}`,`Learner: ${learner}`,`Goal: ${goal}`,`Level: ${level}`,'Return JSON with: plainLanguage, technicalFrame, analogy, visualModel, scenario, memoryHook, retrievalQuestions, instructorPrompt, safetyFlags.','Preserve technical meaning. Do not invent regulations, aircraft procedures, limitations, or operational instructions. Flag claims requiring authoritative verification.'].join('\\n');
}

export function detectRisk(text:string):string[]{
 const t=text.toLowerCase(); const flags:string[]=[];
 if(/regulation|far |14 cfr|faa|airspace|minimum|legal|required/.test(t)) flags.push('REGULATORY_VERIFICATION');
 if(/emergency|stall|spin|engine failure|weather|icing|fuel|runway|takeoff|landing|aircraft procedure/.test(t)) flags.push('SAFETY_CRITICAL_REVIEW');
 if(/medical|medication|mental health|diagnos|symptom/.test(t)) flags.push('MEDICAL_REVIEW');
 return flags;
}
