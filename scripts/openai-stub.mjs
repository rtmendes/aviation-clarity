/**
 * OpenAI-compatible stub for the chat-completions endpoint.
 *
 * Lets the generation path be exercised end to end — request shape, structured
 * output handling, validation, the safety gate, persistence and the audit
 * trail — without spending real tokens or needing a live key.
 *
 * Behaviour is selected by what the prompt contains, so one stub covers the
 * success case and every failure mode the provider can produce.
 *
 * Usage: node scripts/openai-stub.mjs [port]
 */
import { createServer } from 'node:http';

const PORT = Number(process.argv[2] ?? 54322);

const GOOD_MODEL = {
  plainLanguage:
    'A wing stops producing enough lift when it meets the air at too steep an angle. That angle, not speed, is what matters.',
  technicalFrame:
    'A stall occurs when the critical angle of attack is exceeded and airflow separates from the upper surface, reducing lift.',
  analogy:
    'Like sliding your flat hand out a car window and tilting it up: past a point the smooth push becomes buffeting.',
  analogyLimits:
    'The hand analogy has no engine, no weight, and no wing camber, so it says nothing about recovery or attitude.',
  visualModel:
    'Angle of attack on the horizontal axis, lift on the vertical: lift rises, peaks, then drops sharply past the peak.',
  scenario:
    'A learner in a steepening turn holds back pressure. Ask what happens to angle of attack before you say anything else.',
  memoryHook: 'Angle, not airspeed.',
  retrievalQuestions: [
    'What single variable determines whether a wing stalls?',
    'Why can a wing stall at a high airspeed?',
    'What happens to the airflow past the critical angle?',
  ],
  commonMisconceptions: [
    'That stalls are caused by flying too slowly.',
    'That an engine at full power prevents a stall.',
  ],
  instructorPrompt:
    'Ask the learner to predict the outcome before demonstrating, then have them explain it back in their own words.',
  claimsRequiringVerification: [
    'Aircraft-specific critical angle of attack and published stall speeds.',
  ],
};

const CLEAN_MODEL = {
  ...GOOD_MODEL,
  plainLanguage: 'A short note about how weather briefings are organised for planning purposes.',
  technicalFrame: 'Briefing products are grouped by the planning horizon they serve.',
  analogy: 'Like reading a weekly forecast before a road trip.',
  analogyLimits: 'A road trip has no alternates and no fuel reserve to plan against.',
  visualModel: 'A timeline from long-range planning on the left to current conditions on the right.',
  scenario: 'A learner plans a cross-country and decides which products to read first.',
  memoryHook: 'Wide to narrow.',
  retrievalQuestions: ['Which product covers the longest planning horizon?'],
  commonMisconceptions: ['That one product answers every planning question.'],
  claimsRequiringVerification: [],
};

const server = createServer((req, res) => {
  if (!req.url.endsWith('/chat/completions') || req.method !== 'POST') {
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: { message: 'no route' } }));
  }

  if (!(req.headers.authorization || '').startsWith('Bearer ')) {
    res.writeHead(401, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: { message: 'missing key' } }));
  }

  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    const prompt = JSON.stringify(body.messages ?? []);

    const send = (status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    const wrap = (obj) => ({
      choices: [{ message: { content: JSON.stringify(obj), refusal: null } }],
      usage: { prompt_tokens: 812, completion_tokens: 447 },
    });

    if (prompt.includes('TRIGGER_UPSTREAM_ERROR')) {
      return send(500, { error: { message: 'stub upstream failure' } });
    }
    if (prompt.includes('TRIGGER_REFUSAL')) {
      return send(200, {
        choices: [{ message: { content: null, refusal: 'I cannot help with that.' } }],
        usage: { prompt_tokens: 100, completion_tokens: 0 },
      });
    }
    if (prompt.includes('TRIGGER_BAD_JSON')) {
      return send(200, {
        choices: [{ message: { content: 'this is not json', refusal: null } }],
        usage: { prompt_tokens: 100, completion_tokens: 5 },
      });
    }
    if (prompt.includes('TRIGGER_OFF_CONTRACT')) {
      // Valid JSON, wrong shape — the case structured output is supposed to
      // prevent and validation must still catch.
      return send(200, wrap({ plainLanguage: 'only one field' }));
    }
    if (prompt.includes('TRIGGER_CLEAN')) {
      return send(200, wrap(CLEAN_MODEL));
    }

    return send(200, wrap(GOOD_MODEL));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`openai-stub listening on http://127.0.0.1:${PORT}`);
});
