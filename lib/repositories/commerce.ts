import 'server-only';

import { getAdminSupabase, getSupabase, type Client } from '@/lib/supabase/server';
import type { EntitlementRow, OrderRow, ProductRow } from '@/lib/supabase/types';

import type { Result } from './index';

/**
 * Orders, entitlements and the webhook ledger.
 *
 * Every write here runs with the secret key: these are consequences of a
 * payment, not actions a user takes, and they must succeed regardless of who
 * is signed in — a webhook arrives with no session at all.
 */

function err(
  code: 'not_configured' | 'unavailable' | 'invalid' | 'not_found',
  message: string,
): Result<never> {
  return { ok: false, error: { code, message } };
}

async function withAdmin<T>(fn: (client: Client) => Promise<Result<T>>): Promise<Result<T>> {
  const result = getAdminSupabase();
  if (!result.ok) {
    return {
      ok: false,
      error: {
        code: 'not_configured',
        message:
          result.invalid.length > 0
            ? 'Supabase is misconfigured for this environment.'
            : 'Supabase is not configured for this environment.',
        missing: result.missing,
        invalid: result.invalid,
      },
    };
  }
  try {
    return await fn(result.client);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown transport error';
    return err('unavailable', `Could not reach Supabase: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export async function listLiveProducts(): Promise<Result<ProductRow[]>> {
  const result = getSupabase();
  if (!result.ok) {
    return {
      ok: false,
      error: {
        code: 'not_configured',
        message: 'Supabase is not configured for this environment.',
        missing: result.missing,
        invalid: result.invalid,
      },
    };
  }
  try {
    const { data, error } = await result.client
      .from('ac_products')
      .select('*')
      .eq('status', 'live')
      .order('price_cents');
    if (error) return err('unavailable', error.message);
    return { ok: true, data: data ?? [] };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown transport error';
    return err('unavailable', `Could not reach Supabase: ${message}`);
  }
}

export async function getProductBySlug(slug: string): Promise<Result<ProductRow>> {
  return withAdmin(async (client) => {
    const { data, error } = await client
      .from('ac_products')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (error) return err('unavailable', error.message);
    if (!data) return err('not_found', 'No such product.');
    if (data.status !== 'live') return err('invalid', 'That product is not on sale.');
    if (data.price_cents === null) return err('invalid', 'That product has no price set.');
    return { ok: true, data };
  });
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export async function createPendingOrder(input: {
  productId: string;
  email: string;
  sessionId: string;
  amountCents: number;
  currency: string;
}): Promise<Result<OrderRow>> {
  return withAdmin(async (client) => {
    const { data, error } = await client
      .from('ac_orders')
      .insert({
        product_id: input.productId,
        email: input.email.toLowerCase(),
        stripe_session_id: input.sessionId,
        amount_cents: input.amountCents,
        currency: input.currency,
        status: 'pending',
      })
      .select()
      .maybeSingle();
    if (error) return err('unavailable', error.message);
    if (!data) return err('unavailable', 'Insert returned no row.');
    return { ok: true, data };
  });
}

// ---------------------------------------------------------------------------
// Webhook ledger
// ---------------------------------------------------------------------------

export type LedgerOutcome = 'recorded' | 'duplicate';

/**
 * Records a webhook before acting on it.
 *
 * Stripe retries until it gets a 2xx, so the same event arrives more than once
 * as a matter of course. The event id is the primary key, so a retry fails the
 * insert and is reported as a duplicate rather than granting a second
 * entitlement.
 */
export async function recordStripeEvent(input: {
  id: string;
  type: string;
  payload: unknown;
}): Promise<Result<LedgerOutcome>> {
  return withAdmin(async (client) => {
    const { error } = await client.from('ac_stripe_events').insert({
      id: input.id,
      type: input.type,
      payload: input.payload as Record<string, never>,
    });

    if (error) {
      if (/duplicate key|stripe_events_pkey/i.test(error.message)) {
        return { ok: true, data: 'duplicate' };
      }
      return err('unavailable', error.message);
    }
    return { ok: true, data: 'recorded' };
  });
}

export async function markStripeEventProcessed(id: string, error?: string): Promise<void> {
  const result = getAdminSupabase();
  if (!result.ok) return;
  try {
    await result.client
      .from('ac_stripe_events')
      .update({ processed_at: new Date().toISOString(), error: error ?? null })
      .eq('id', id);
  } catch {
    // The ledger is an aid to operators, not part of the payment guarantee;
    // failing to stamp it must not fail the webhook.
  }
}

// ---------------------------------------------------------------------------
// Fulfilment
// ---------------------------------------------------------------------------

/**
 * Marks the order paid and grants the entitlement.
 *
 * Order first: an entitlement without a paid order is unexplainable, whereas a
 * paid order whose entitlement insert then fails is visible and repairable —
 * and the webhook retry will complete it, because the grant is idempotent.
 */
export async function fulfilPurchase(input: {
  sessionId: string;
  paymentIntent: string;
  email: string;
}): Promise<Result<{ orderId: string; productId: string; alreadyGranted: boolean }>> {
  const email = input.email.toLowerCase();

  // Annotated: inference would otherwise fix the generic from the first return
  // and narrow `alreadyGranted` to a literal.
  return withAdmin<{ orderId: string; productId: string; alreadyGranted: boolean }>(async (client) => {
    const { data: order, error: orderError } = await client
      .from('ac_orders')
      .update({ status: 'paid', stripe_payment_intent: input.paymentIntent })
      .eq('stripe_session_id', input.sessionId)
      .select()
      .maybeSingle();

    if (orderError) return err('unavailable', orderError.message);
    if (!order) return err('not_found', 'No order matches that checkout session.');
    if (!order.product_id) return err('invalid', 'That order has no product attached.');

    const { error: grantError } = await client.from('ac_entitlements').insert({
      email,
      product_id: order.product_id,
      order_id: order.id,
    });

    if (grantError) {
      // The partial unique index makes a repeat grant a no-op, which is what a
      // webhook retry should be.
      if (/duplicate key|entitlements_unique_grant/i.test(grantError.message)) {
        return {
          ok: true,
          data: { orderId: order.id, productId: order.product_id, alreadyGranted: true },
        };
      }
      return err('unavailable', grantError.message);
    }

    return {
      ok: true,
      data: { orderId: order.id, productId: order.product_id, alreadyGranted: false },
    };
  });
}

export async function revokeForRefund(paymentIntent: string): Promise<Result<number>> {
  return withAdmin(async (client) => {
    const { data: orders, error } = await client
      .from('ac_orders')
      .update({ status: 'refunded' })
      .eq('stripe_payment_intent', paymentIntent)
      .select();

    if (error) return err('unavailable', error.message);
    if (!orders || orders.length === 0) return { ok: true, data: 0 };

    const { error: revokeError } = await client
      .from('ac_entitlements')
      .update({ revoked_at: new Date().toISOString(), revoked_reason: 'refund' })
      .in('order_id', orders.map((o) => o.id))
      .is('revoked_at', null);

    if (revokeError) return err('unavailable', revokeError.message);
    return { ok: true, data: orders.length };
  });
}

// ---------------------------------------------------------------------------
// Entitlements
// ---------------------------------------------------------------------------

/** What a given email owns. Read with the secret key so it works pre-sign-in. */
export async function listEntitlements(email: string): Promise<Result<EntitlementRow[]>> {
  return withAdmin(async (client) => {
    const { data, error } = await client
      .from('ac_entitlements')
      .select('*')
      .eq('email', email.toLowerCase())
      .is('revoked_at', null);
    if (error) return err('unavailable', error.message);
    return { ok: true, data: data ?? [] };
  });
}
