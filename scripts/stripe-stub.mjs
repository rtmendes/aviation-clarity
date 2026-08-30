/**
 * Stripe-compatible stub: Checkout Session creation.
 *
 * Lets the whole purchase path run — checkout, webhook, entitlement, gated
 * delivery — with no Stripe account, no live keys and no spend.
 *
 * Usage: node scripts/stripe-stub.mjs [port]
 */
import { createServer } from 'node:http';

const PORT = Number(process.argv[2] ?? 54323);

/** Sessions the stub has issued, so a webhook can reference a real one. */
export const sessions = new Map();

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  // --- Stripe: create a Checkout Session ------------------------------------
  if (url.pathname === '/checkout/sessions' && req.method === 'POST') {
    if (!String(req.headers['authorization'] ?? '').startsWith('Bearer ')) {
      return send(401, { error: { message: 'no api key' } });
    }

    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const params = new URLSearchParams(raw);
      const amount = params.get('line_items[0][price_data][unit_amount]');

      // Stripe rejects a zero or missing amount; the stub does too, so the
      // route's error path is exercised rather than assumed.
      if (!amount || Number(amount) <= 0) {
        return send(400, { error: { message: 'Invalid unit_amount.' } });
      }

      const id = `cs_test_${Math.random().toString(36).slice(2, 12)}`;
      sessions.set(id, { amount: Number(amount) });
      return send(200, { id, url: `https://checkout.stripe.test/pay/${id}` });
    });
    return;
  }

  return send(404, { error: { message: 'no route' } });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`stripe-stub listening on http://127.0.0.1:${PORT}`);
});
