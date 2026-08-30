export type QASeverity='info'|'warning'|'block';
export type QAFinding={severity:QASeverity;code:string;message:string};
export type QAReport={pass:boolean;findings:QAFinding[]};
export function qaContent(text:string):QAReport{
 const findings:QAFinding[]=[]; const t=text.toLowerCase();
 if(/14 cfr|far part|faa regulation|legal minimum|required by faa/.test(t)) findings.push({severity:'block',code:'REGULATORY_CLAIM',message:'Regulatory claim requires authoritative source verification.'});
 if(/emergency|engine failure|stall|spin|icing|fuel emergency|takeoff procedure|landing procedure/.test(t)) findings.push({severity:'block',code:'OPERATIONAL_CLAIM',message:'Potential operational/safety-critical claim requires qualified review and authoritative verification.'});
 if(/diagnos|treat|medication|medical advice/.test(t)) findings.push({severity:'block',code:'MEDICAL_CLAIM',message:'Medical claim requires qualified review.'});
 if(!text.trim()) findings.push({severity:'block',code:'EMPTY_CONTENT',message:'Content is empty.'});
 return {pass:!findings.some(f=>f.severity==='block'),findings};
}
