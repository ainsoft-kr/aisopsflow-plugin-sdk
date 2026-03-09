import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { constantTimeEquals, requireInternalAuthJson, signedInternalHeaders } from '../shared/internal-auth.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 9000;
const CORE_BASE_URL = process.env.CORE_BASE_URL || 'http://core:8080';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';
const INTERNAL_AUTH_TOKEN = process.env.AISOPSFLOW_INTERNAL_AUTH_TOKEN || process.env.INTERNAL_AUTH_TOKEN || '';
const BODY_LIMIT = '64kb';

const app = express();

const captureRawBody = (req, _res, buf) => {
  req.rawBody = buf ? buf.toString('utf8') : '';
};

// Slack sends urlencoded for interactive payload; events are JSON.
app.use('/slack/interactive', bodyParser.urlencoded({ extended: false, verify: captureRawBody, limit: BODY_LIMIT }));
app.use('/slack/events', bodyParser.json({ type: '*/*', verify: captureRawBody, limit: BODY_LIMIT }));
app.use('/send', bodyParser.json({ type: '*/*', verify: captureRawBody, limit: BODY_LIMIT }));

app.post('/probe', async (_req, res) => {
  res.json({ ok: true, name: 'channel-slack', version: '0.1.0', capabilities: ['send.slack', 'approval.slack'] });
});

// Core -> Slack: send message.
// Body: { target: "#channel"|"C123", text: "...", blocks?: [...] }
app.post('/send', requireInternalAuth, async (req, res) => {
  try {
    const { target, text, blocks } = req.body || {};
    if (typeof target !== 'string' || typeof text !== 'string') {
      return res.status(400).json({ ok: false, error: 'target and text must be strings' });
    }
    if (!target.trim() || !text.trim()) {
      return res.status(400).json({ ok: false, error: 'target and text required' });
    }
    if (target.length > 128 || text.length > 4000) {
      return res.status(400).json({ ok: false, error: 'target or text too long' });
    }
    if (blocks !== undefined && !Array.isArray(blocks)) {
      return res.status(400).json({ ok: false, error: 'blocks must be an array when provided' });
    }

    const payload = { channel: target, text, blocks };
    const r = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const j = await r.json();
    res.json({ ok: Boolean(j.ok), slack: j, error: j.error || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Slack Events API endpoint.
app.post('/slack/events', async (req, res) => {
  if (!verifySlackSignature(req)) {
    return res.status(401).send('unauthorized');
  }

  // URL verification
  if (req.body && req.body.type === 'url_verification') {
    return res.json({ challenge: req.body.challenge });
  }

  // For v0.1 we don't process message events. Ack fast.
  res.status(200).send('OK');
});

// Slack interactive buttons (approval)
app.post('/slack/interactive', async (req, res) => {
  if (!verifySlackSignature(req)) {
    return res.status(401).send('unauthorized');
  }
  if (!INTERNAL_AUTH_TOKEN) {
    return res.status(503).send('internal auth is not configured');
  }

  let payload;
  try {
    payload = req.body?.payload ? JSON.parse(req.body.payload) : null;
  } catch (_e) {
    return res.status(400).send('invalid payload');
  }
  if (!payload) return res.status(400).send('missing payload');

  const action = payload.actions?.[0];
  const actor = payload.user?.id;
  if (!action || !actor || !['approve', 'reject'].includes(action.action_id)) {
    return res.status(400).send('invalid interactive action');
  }

  let val;
  try {
    val = action?.value ? JSON.parse(action.value) : null;
  } catch (_e) {
    return res.status(400).send('invalid action value');
  }
  if (!val?.executionId || !val?.stepId) return res.status(400).send('missing approval keys');

  // Ack quickly, then perform callback to core.
  res.status(200).send('');

  const decision = action.action_id === 'approve' ? 'approved' : 'rejected';
  const callbackPath = `/api/approvals/${encodeURIComponent(val.executionId)}/${encodeURIComponent(val.stepId)}/resolve`;
  const callbackBody = JSON.stringify({ decision, actor_ref: `slack:${actor}` });
  const headers = signedInternalHeaders(INTERNAL_AUTH_TOKEN, 'POST', callbackPath, callbackBody);

  try {
    const callbackRes = await fetch(`${CORE_BASE_URL}${callbackPath}`, {
      method: 'POST',
      headers,
      body: callbackBody
    });
    if (!callbackRes.ok) {
      const responseBody = await callbackRes.text().catch(() => '');
      console.error(`approval callback failed status=${callbackRes.status} execution_id=${val.executionId} step_id=${val.stepId} body=${responseBody}`);
    }
  } catch (e) {
    console.error(`approval callback error execution_id=${val.executionId} step_id=${val.stepId}`, e);
  }
});

function requireInternalAuth(req, res, next) {
  return requireInternalAuthJson(req, res, next, INTERNAL_AUTH_TOKEN);
}

function verifySlackSignature(req) {
  if (!SLACK_SIGNING_SECRET) return false;
  const timestamp = req.get('X-Slack-Request-Timestamp');
  const signature = req.get('X-Slack-Signature');
  if (!timestamp || !signature) return false;

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - tsNum) > 300) return false;

  const rawBody = req.rawBody || '';
  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${crypto.createHmac('sha256', SLACK_SIGNING_SECRET).update(base).digest('hex')}`;
  return constantTimeEquals(expected, signature);
}

app.listen(PORT, () => console.log(`slack plugin listening on :${PORT}`));
