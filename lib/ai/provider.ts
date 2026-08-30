import 'server-only';

import type { GeneratedLearningModel } from './schema';

/**
 * Provider-agnostic generation boundary.
 *
 * docs/TECH-STACK.md requires that business logic stay provider-agnostic so a
 * model vendor can be replaced without rewriting product code. Everything
 * above this file talks to `GenerationProvider`; nothing above it imports a
 * vendor SDK or knows a vendor's request shape.
 */

export type TokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

export type GenerationOutcome =
  | {
      ok: true;
      value: GeneratedLearningModel;
      providerName: string;
      modelId: string;
      usage: TokenUsage;
      costUsd: number | null;
      durationMs: number;
    }
  | {
      ok: false;
      /**
       * not_configured — no credentials for any provider.
       * refused       — the provider declined to answer.
       * malformed     — a response came back but did not match the contract.
       * upstream      — transport failure, rate limit, or provider error.
       */
      code: 'not_configured' | 'refused' | 'malformed' | 'upstream';
      message: string;
      providerName: string | null;
      durationMs: number;
    };

export type GenerationRequest = {
  systemPrompt: string;
  userPrompt: string;
  /** Bounded so a runaway generation cannot burn an unbounded number of tokens. */
  maxOutputTokens?: number;
};

export interface GenerationProvider {
  readonly name: string;
  readonly modelId: string;
  generate(request: GenerationRequest): Promise<GenerationOutcome>;
}
