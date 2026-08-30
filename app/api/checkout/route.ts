import { fail, ok, readJson, requireString } from '@/lib/http';
import { createCheckoutSession, getStripeConfig } from '@/lib/payments/stripe';
import { createPendingOrder, getProductBySlug } from '@/lib/repositories/commerce';

export const dynamic = 'force-dynamic';

/**
 * Starts a purchase.
 *
 * Deliberately unauthenticated: requiring an account before payment loses
 * buyers, and Checkout collects a verified email anyway. The entitlement is
 * keyed to that email and resolves to an account whenever the buyer signs in.
 *
 * The price comes from the product row, never from the request. A client-
 * supplied amount is a client-chosen amount.
 */
export async function POST(request: Request) {
  const stripe = getStripeConfig();
  if (!stripe) {
    return fail('Payments are not configured. Set STRIPE_SECRET_KEY.', 503);
  }

  const body = await readJson(request);
  if (!body.ok) return fail(body.message, 400);

  const slug = requireString(body.value, 'productSlug', { maxLength: 200 });
  if (!slug.ok) return fail(slug.message, 400);

  const email = requireString(body.value, 'email', { maxLength: 320 });
  if (!email.ok) return fail(email.message, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value)) {
    return fail('"email" must be a valid email address.', 400);
  }

  const product = await getProductBySlug(slug.value);
  if (!product.ok) {
    const status =
      product.error.code === 'not_found' ? 404
      : product.error.code === 'invalid' ? 409
      : product.error.code === 'not_configured' ? 503
      : 502;
    return fail(product.error.message, status);
  }

  const origin = new URL(request.url).origin;
  const amountCents = product.data.price_cents ?? 0;

  const session = await createCheckoutSession(stripe, {
    productName: product.data.name,
    amountCents,
    currency: product.data.currency,
    successUrl: `${origin}/purchase/complete?session={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/`,
    metadata: { product_id: product.data.id, product_slug: product.data.slug ?? '' },
  });

  if (!session.ok) return fail(session.reason, 502);

  // Recorded before the buyer is sent to Stripe, so the webhook has something
  // to match against when it arrives.
  const order = await createPendingOrder({
    productId: product.data.id,
    email: email.value,
    sessionId: session.sessionId,
    amountCents,
    currency: product.data.currency,
  });

  if (!order.ok) return fail(order.error.message, 502);

  return ok({ checkoutUrl: session.url, sessionId: session.sessionId, orderId: order.data.id }, 201);
}
