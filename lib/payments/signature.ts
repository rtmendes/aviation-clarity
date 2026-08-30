import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stripe webhook signature verification.
 *
 * Deliberately free of `server-only` and of any environment access: this is the
 * one security-critical computation in the payment path, and it should be
 * testable directly rather than only through a running route.
 */

/**
 * Stripe's default replay window. A signature older than this is rejected even
 * if it verifies: a valid-but-old request is exactly what a replay looks like.
 */
const TOLERANCE_SECONDS = 300;

export type VerifyResult =
  | { ok: true; event: StripeEvent }
  | { ok: false; reason: string };

export type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Verifies a webhook against `Stripe-Signature`.
 *
 * The header carries a timestamp and one or more v1 signatures:
 *   t=1700000000,v1=abc…,v1=def…
 * The signed payload is `${t}.${rawBody}`, HMAC-SHA256 with the endpoint
 * secret. Multiple v1 values appear during a secret rotation, so any match is
 * accepted.
 *
 * `rawBody` must be the exact bytes received. Re-serialising parsed JSON
 * changes key order and whitespace, and the signature will never match.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): VerifyResult {
  if (!signatureHeader) return { ok: false, reason: 'Missing Stripe-Signature header.' };

  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of signatureHeader.split(',')) {
    const [key, value] = part.split('=', 2);
    if (!key || !value) continue;
    if (key.trim() === 't') timestamp = Number(value.trim());
    if (key.trim() === 'v1') signatures.push(value.trim());
  }

  if (timestamp === null || !Number.isFinite(timestamp)) {
    return { ok: false, reason: 'Signature header has no usable timestamp.' };
  }
  if (signatures.length === 0) {
    return { ok: false, reason: 'Signature header has no v1 signature.' };
  }
  if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) {
    return { ok: false, reason: 'Signature timestamp is outside the tolerance window.' };
  }

  const expected = createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');

  if (!signatures.some((candidate) => safeEqualHex(candidate, expected))) {
    return { ok: false, reason: 'Signature does not match.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: 'Body is not valid JSON.' };
  }

  const event = parsed as Partial<StripeEvent>;
  if (typeof event.id !== 'string' || typeof event.type !== 'string') {
    return { ok: false, reason: 'Body is not a Stripe event.' };
  }

  return {
    ok: true,
    event: {
      id: event.id,
      type: event.type,
      data: (event.data ?? { object: {} }) as StripeEvent['data'],
    },
  };
}

