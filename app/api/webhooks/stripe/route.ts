import { getStripeConfig, verifyWebhookSignature } from '@/lib/payments/stripe';
import {
  fulfilPurchase,
  markStripeEventProcessed,
  recordStripeEvent,
  revokeForRefund,
} from '@/lib/repositories/commerce';

export const dynamic = 'force-dynamic';

/**
 * Stripe webhook endpoint — the source of truth for payment state.
 *
 * Order of operations matters:
 *   1. Verify the signature against the RAW body. Anything unverified is
 *      discarded before it can touch the database.
 *   2. Record the event under its Stripe id. A retry collides and returns
 *      early, so fulfilment happens at most once.
 *   3. Act on it.
 *
 * Responses are deliberately terse. This endpoint is talking to Stripe, and a
 * detailed error body would describe our internals to anyone who can post here.
 */
export async function POST(request: Request) {
  const stripe = getStripeConfig();
  if (!stripe?.webhookSecret) {
    return new Response('Webhook not configured', { status: 503 });
  }

  // Must be the exact bytes received: re-serialising parsed JSON changes key
  // order and whitespace, and the signature would never match.
  const rawBody = await request.text();

  const verified = verifyWebhookSignature(
    rawBody,
    request.headers.get('stripe-signature'),
    stripe.webhookSecret,
  );

  if (!verified.ok) {
    return new Response('Invalid signature', { status: 400 });
  }

  const { event } = verified;

  const ledger = await recordStripeEvent({ id: event.id, type: event.type, payload: event });
  if (!ledger.ok) {
    // 500 so Stripe retries: the event is real but we could not record it.
    return new Response('Could not record event', { status: 500 });
  }
  if (ledger.data === 'duplicate') {
    return Response.json({ received: true, duplicate: true });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as {
        id?: string;
        payment_intent?: string;
        customer_details?: { email?: string };
        customer_email?: string;
      };

      const email = session.customer_details?.email ?? session.customer_email;
      if (!session.id || !email) {
        await markStripeEventProcessed(event.id, 'Session had no id or email.');
        return Response.json({ received: true, ignored: 'incomplete session' });
      }

      const result = await fulfilPurchase({
        sessionId: session.id,
        paymentIntent: session.payment_intent ?? session.id,
        email,
      });

      if (!result.ok) {
        await markStripeEventProcessed(event.id, result.error.message);
        // Retry: the payment happened, so the entitlement must eventually exist.
        return new Response('Fulfilment failed', { status: 500 });
      }

      await markStripeEventProcessed(event.id);
      return Response.json({ received: true, granted: !result.data.alreadyGranted });
    }

    if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
      const charge = event.data.object as { payment_intent?: string };
      if (charge.payment_intent) {
        await revokeForRefund(charge.payment_intent);
      }
      await markStripeEventProcessed(event.id);
      return Response.json({ received: true, revoked: true });
    }

    // Everything else is acknowledged so Stripe stops retrying, and stays in
    // the ledger for an operator to look at.
    await markStripeEventProcessed(event.id);
    return Response.json({ received: true, ignored: event.type });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'unknown error';
    await markStripeEventProcessed(event.id, message);
    return new Response('Handler failed', { status: 500 });
  }
}
