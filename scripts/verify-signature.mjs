/**
 * Unit tests for Stripe webhook signature verification.
 *
 * This is the one place where getting the cryptography wrong lets an attacker
 * grant themselves an entitlement, so it is tested directly rather than only
 * through a running route: forged signatures, replays, tampered bodies, and
 * the secret-rotation case where two signatures are present.
 *
 * Node strips the TypeScript types at load; no build step is involved.
 */
import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from '../lib/payments/signature.ts';

const SECRET = 'whsec_test_secret';
const NOW = 1_800_000_000;

let pass = 0;
let fail = 0;

const check = (name, ok, detail = '') => {
  if (ok) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); fail++; }
};

const sign = (body, secret = SECRET, t = NOW) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex')}`;

const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } });

console.log('Verifying Stripe webhook signatures:');

let r = verifyWebhookSignature(body, sign(body), SECRET, NOW);
check('a correctly signed payload verifies', r.ok && r.event.id === 'evt_1', r.ok ? '' : r.reason);

r = verifyWebhookSignature(body, sign(body, 'whsec_wrong'), SECRET, NOW);
check('a signature made with the wrong secret is rejected', !r.ok && /does not match/.test(r.reason));

// The attack this defends against: keep the signature, change the payload.
const tampered = body.replace('cs_1', 'cs_attacker');
r = verifyWebhookSignature(tampered, sign(body), SECRET, NOW);
check('a tampered body is rejected', !r.ok && /does not match/.test(r.reason));

r = verifyWebhookSignature(body, sign(body, SECRET, NOW - 301), SECRET, NOW);
check('a replayed signature outside the window is rejected', !r.ok && /tolerance/.test(r.reason));

r = verifyWebhookSignature(body, sign(body, SECRET, NOW - 299), SECRET, NOW);
check('a signature inside the window is accepted', r.ok);

// Clock skew works in both directions.
r = verifyWebhookSignature(body, sign(body, SECRET, NOW + 301), SECRET, NOW);
check('a future-dated signature is rejected', !r.ok && /tolerance/.test(r.reason));

r = verifyWebhookSignature(body, null, SECRET, NOW);
check('a missing signature header is rejected', !r.ok && /Missing/.test(r.reason));

r = verifyWebhookSignature(body, `t=${NOW}`, SECRET, NOW);
check('a header with no v1 signature is rejected', !r.ok && /no v1/.test(r.reason));

r = verifyWebhookSignature(body, `v1=abc`, SECRET, NOW);
check('a header with no timestamp is rejected', !r.ok && /timestamp/.test(r.reason));

// During a secret rotation Stripe sends one v1 per active secret.
const rotating = `${sign(body, 'whsec_old')},v1=${createHmac('sha256', SECRET).update(`${NOW}.${body}`, 'utf8').digest('hex')}`;
r = verifyWebhookSignature(body, rotating, SECRET, NOW);
check('one matching signature among several is enough', r.ok, r.ok ? '' : r.reason);

r = verifyWebhookSignature(body, `t=${NOW},v1=nothex!!`, SECRET, NOW);
check('a non-hex signature is rejected rather than throwing', !r.ok);

r = verifyWebhookSignature('not json', sign('not json'), SECRET, NOW);
check('a validly signed non-JSON body is rejected', !r.ok && /valid JSON/.test(r.reason));

r = verifyWebhookSignature('{"hello":"world"}', sign('{"hello":"world"}'), SECRET, NOW);
check('a validly signed non-event body is rejected', !r.ok && /not a Stripe event/.test(r.reason));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
