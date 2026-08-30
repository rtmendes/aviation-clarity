import 'server-only';

/**
 * Stripe integration over the HTTP API.
 *
 * No SDK, for the same reason the model provider has none: the surface used is
 * two endpoints, and this project's builds were broken once by a dependency
 * resolving a new major at deploy time. Webhook verification is implemented
 * against Stripe's documented signing scheme rather than trusting a library to
 * do the one security-critical step for us.
 */

/** Overridable so the payment path can be pointed at a gateway or the
    verification stub. Defaults to Stripe itself. */
function apiBase(): string {
  return (process.env.STRIPE_API_BASE?.trim() || 'https://api.stripe.com/v1').replace(/\/$/, '');
}

export type { StripeEvent, VerifyResult } from './signature';
export { verifyWebhookSignature } from './signature';

export type StripeConfig = {
  secretKey: string;
  webhookSecret: string | null;
};

export function getStripeConfig(): StripeConfig | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  return {
    secretKey,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || null,
  };
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export type CheckoutInput = {
  productName: string;
  amountCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  /** Carried through the payment and read back off the webhook. */
  metadata: Record<string, string>;
};

export type CheckoutResult =
  | { ok: true; sessionId: string; url: string }
  | { ok: false; reason: string };

/**
 * Creates a Checkout Session with an inline price.
 *
 * Inline rather than a Stripe Price id so the catalogue stays in the database:
 * a price kept in two systems drifts, and the one a customer is charged should
 * be the one the product row says.
 */
export async function createCheckoutSession(
  config: StripeConfig,
  input: CheckoutInput,
): Promise<CheckoutResult> {
  const body = new URLSearchParams({
    mode: 'payment',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': input.currency,
    'line_items[0][price_data][unit_amount]': String(input.amountCents),
    'line_items[0][price_data][product_data][name]': input.productName,
  });

  for (const [key, value] of Object.entries(input.metadata)) {
    body.append(`metadata[${key}]`, value);
  }

  try {
    const response = await fetch(`${apiBase()}/checkout/sessions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const payload = (await response.json()) as {
      id?: string;
      url?: string;
      error?: { message?: string };
    };

    if (!response.ok) {
      // Stripe's message is safe to surface: it describes the request, not the
      // account, and an operator needs it to fix a misconfigured price.
      return { ok: false, reason: payload.error?.message ?? `Stripe returned HTTP ${response.status}.` };
    }
    if (!payload.id || !payload.url) {
      return { ok: false, reason: 'Stripe did not return a checkout session.' };
    }

    return { ok: true, sessionId: payload.id, url: payload.url };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'unknown error';
    return { ok: false, reason: `Could not reach Stripe: ${message}` };
  }
}
