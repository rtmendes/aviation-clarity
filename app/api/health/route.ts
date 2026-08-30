import { NextResponse } from 'next/server';
export async function GET(){return NextResponse.json({ok:true,service:'aviation-clarity',version:'0.2.0',timestamp:new Date().toISOString(),integrations:{openai:Boolean(process.env.OPENAI_API_KEY),supabase:Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),stripe:Boolean(process.env.STRIPE_SECRET_KEY)}})}
