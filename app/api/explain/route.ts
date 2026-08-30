import { NextResponse } from 'next/server';
import { buildLearningModel, safetyScan } from '@/lib/explanation-engine';
import type { Sensitivity } from '@/lib/types';

export async function POST(request:Request){
  try {
    const body=await request.json();
    const topic=String(body.topic||'').trim();
    if(!topic) return NextResponse.json({error:'topic is required'},{status:400});
    const sensitivity=(body.sensitivity||'technical') as Sensitivity;
    const model=buildLearningModel(topic,sensitivity);
    const scan=safetyScan(JSON.stringify(model));
    return NextResponse.json({topic,sensitivity,model,safety:scan,generatedAt:new Date().toISOString()});
  } catch { return NextResponse.json({error:'Invalid request'},{status:400}); }
}
