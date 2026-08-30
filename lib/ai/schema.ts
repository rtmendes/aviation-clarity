/**
 * The content package the Aviation Explanation Engine produces.
 *
 * This is the contract in three places at once, and they must agree:
 *   1. `LEARNING_MODEL_JSON_SCHEMA` constrains the model's structured output.
 *   2. `validateLearningModel` re-checks what came back, because a provider
 *      can still return something off-contract on a refusal or a truncation.
 *   3. `GeneratedLearningModel` is how the rest of the app sees it.
 *
 * Fields exist to serve the pedagogy, not the model: each one is a distinct
 * teaching move, so a missing field means a lesson with a hole in it rather
 * than a cosmetic defect.
 */

export type GeneratedLearningModel = {
  /** Plain-language explanation a student pilot can follow without jargon. */
  plainLanguage: string;
  /** The same concept stated precisely, with correct terminology. */
  technicalFrame: string;
  /** A familiar comparison, and explicitly where it breaks down. */
  analogy: string;
  /** Where the analogy stops being accurate. Separated so it cannot be skipped. */
  analogyLimits: string;
  /** Inputs to outcome, described so it can be drawn. */
  visualModel: string;
  /** A realistic training situation the learner reasons about. */
  scenario: string;
  /** A retention hook — mnemonic, chunk or cue. */
  memoryHook: string;
  /** Questions that force recall rather than recognition. */
  retrievalQuestions: string[];
  /** Mistakes learners actually make on this concept. */
  commonMisconceptions: string[];
  /** How a CFI should introduce and check this concept. */
  instructorPrompt: string;
  /**
   * Claims the model believes require authoritative verification. This is the
   * model's self-report and is treated as a hint that raises review priority,
   * never as a substitute for the QA gate.
   */
  claimsRequiringVerification: string[];
};

/** Bound to the provider's structured-output mode. */
export const LEARNING_MODEL_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'plainLanguage',
    'technicalFrame',
    'analogy',
    'analogyLimits',
    'visualModel',
    'scenario',
    'memoryHook',
    'retrievalQuestions',
    'commonMisconceptions',
    'instructorPrompt',
    'claimsRequiringVerification',
  ],
  properties: {
    plainLanguage: { type: 'string' },
    technicalFrame: { type: 'string' },
    analogy: { type: 'string' },
    analogyLimits: { type: 'string' },
    visualModel: { type: 'string' },
    scenario: { type: 'string' },
    memoryHook: { type: 'string' },
    retrievalQuestions: { type: 'array', items: { type: 'string' } },
    commonMisconceptions: { type: 'array', items: { type: 'string' } },
    instructorPrompt: { type: 'string' },
    claimsRequiringVerification: { type: 'array', items: { type: 'string' } },
  },
} as const;

const REQUIRED_STRINGS = [
  'plainLanguage',
  'technicalFrame',
  'analogy',
  'analogyLimits',
  'visualModel',
  'scenario',
  'memoryHook',
  'instructorPrompt',
] as const;

const REQUIRED_ARRAYS = [
  'retrievalQuestions',
  'commonMisconceptions',
  'claimsRequiringVerification',
] as const;

export type ValidationResult =
  | { ok: true; value: GeneratedLearningModel }
  | { ok: false; problems: string[] };

/**
 * Re-validates provider output.
 *
 * Structured-output mode is a strong constraint, not a guarantee: a refusal, a
 * length cut-off, or a proxy in front of the API can all yield something that
 * does not match. Persisting an unvalidated package would put a half-formed
 * lesson into the knowledge base, so it is checked again here.
 */
export function validateLearningModel(input: unknown): ValidationResult {
  const problems: string[] = [];

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, problems: ['Response was not a JSON object.'] };
  }

  const record = input as Record<string, unknown>;

  for (const key of REQUIRED_STRINGS) {
    const value = record[key];
    if (typeof value !== 'string' || !value.trim()) {
      problems.push(`"${key}" must be a non-empty string.`);
    }
  }

  for (const key of REQUIRED_ARRAYS) {
    const value = record[key];
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      problems.push(`"${key}" must be an array of strings.`);
      continue;
    }
    // claimsRequiringVerification is legitimately empty for a non-technical
    // concept; the other two are not — a lesson with no recall questions and
    // no misconceptions has not done its job.
    if (key !== 'claimsRequiringVerification' && value.length === 0) {
      problems.push(`"${key}" must contain at least one entry.`);
    }
  }

  if (problems.length > 0) return { ok: false, problems };

  return { ok: true, value: record as unknown as GeneratedLearningModel };
}
