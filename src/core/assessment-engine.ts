export type Question={id:string;prompt:string;choices:string[];answer:number;explanation:string;sourceIds:string[]};
export type Assessment={id:string;title:string;questions:Question[]};
export function scoreAssessment(a:Assessment,answers:number[]){const correct=a.questions.reduce((n,q,i)=>n+(answers[i]===q.answer?1:0),0);return {correct,total:a.questions.length,percent:a.questions.length?Math.round(correct/a.questions.length*100):0};}
export function unanswered(a:Assessment,answers:number[]){return a.questions.filter((_,i)=>answers[i]===undefined).map(q=>q.id);}
