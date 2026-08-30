import 'server-only';

import { OpenAIProvider } from './openai';
import type { GenerationProvider } from './provider';

/**
 * Provider selection.
 *
 * `AI_PROVIDER` pins a choice; otherwise the first provider with credentials
 * wins. Returning null rather than throwing keeps an unconfigured deployment
 * building and serving — the engine degrades to its deterministic scaffold
 * instead of the whole route failing.
 *
 * To add a provider: implement `GenerationProvider`, and register it below.
 * Nothing outside lib/ai needs to change.
 */
export function getGenerationProvider(): GenerationProvider | null {
  const pinned = process.env.AI_PROVIDER?.trim().toLowerCase();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();

  if (pinned && pinned !== 'openai') return null;
  if (!openaiKey) return null;

  return new OpenAIProvider(openaiKey);
}

export function describeProvider(): { configured: boolean; name: string | null; modelId: string | null } {
  const provider = getGenerationProvider();
  if (!provider) return { configured: false, name: null, modelId: null };
  return { configured: true, name: provider.name, modelId: provider.modelId };
}

export type { GenerationProvider, GenerationOutcome, TokenUsage } from './provider';
export { PROMPT_VERSION } from './prompts';
export type { GeneratedLearningModel } from './schema';
