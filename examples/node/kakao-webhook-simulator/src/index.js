import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import { requireInternalAuthJson, signedInternalHeaders } from '../shared/internal-auth.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 9010;
const CORE_DELIVERY_EVENTS_URL = process.env.CORE_DELIVERY_EVENTS_URL || 'http://core:8080/api/kakao/delivery-events';
const INTERNAL_AUTH_TOKEN = process.env.AISOPSFLOW_INTERNAL_AUTH_TOKEN || process.env.INTERNAL_AUTH_TOKEN || '';
const BODY_LIMIT = '32kb';

const app = express();
const captureRawBody = (req, _res, buf) => {
  req.rawBody = buf ? buf.toString('utf8') : '';
};
app.use(bodyParser.json({ type: '*/*', limit: BODY_LIMIT, verify: captureRawBody }));

app.post('/probe', (_req, res) => {
  res.json({ ok: true, name: 'kakao-webhook-simulator', version: '0.1.0', capabilities: ['kakao.delivery.simulate'] });
});

// Called by mock provider.
app.post('/simulate', requireInternalAuth, async (req, res) => {
  const { provider_message_id, trace_id } = req.body || {};
  if (typeof provider_message_id !== 'string' || !provider_message_id.trim()) {
    return res.status(400).json({ ok: false, error: 'provider_message_id required' });
  }
  if (provider_message_id.length > 128) {
    return res.status(400).json({ ok: false, error: 'provider_message_id too long' });
  }
  const resolvedTraceId =
    typeof trace_id === 'string' && trace_id.trim()
      ? trace_id.trim()
      : provider_message_id;

  // For v0.1: always succeed after small delay.
  setTimeout(async () => {
    try {
      const bodyText = JSON.stringify({ trace_id: resolvedTraceId, status: 'DELIVERED', detail: null, ts: new Date().toISOString() });
      const callbackPath = '/api/kakao/delivery-events';
      const headers = signedInternalHeaders(INTERNAL_AUTH_TOKEN, 'POST', callbackPath, bodyText);

      await fetch(CORE_DELIVERY_EVENTS_URL, {
        method: 'POST',
        headers,
        body: bodyText
      });
    } catch (e) {
      console.error(e);
    }
  }, 500);

  res.json({ ok: true });
});

function requireInternalAuth(req, res, next) {
  return requireInternalAuthJson(req, res, next, INTERNAL_AUTH_TOKEN);
}

app.listen(PORT, () => console.log(`kakao webhook simulator listening on :${PORT}`));
