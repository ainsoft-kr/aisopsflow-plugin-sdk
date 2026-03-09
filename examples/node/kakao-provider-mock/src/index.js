import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { requireInternalAuthJson, signedInternalHeaders } from '../shared/internal-auth.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 9011;
const SIMULATOR_URL = process.env.SIMULATOR_URL || 'http://kakao_simulator:9010';
const INTERNAL_AUTH_TOKEN = process.env.AISOPSFLOW_INTERNAL_AUTH_TOKEN || process.env.INTERNAL_AUTH_TOKEN || '';
const BODY_LIMIT = '64kb';

const app = express();
const captureRawBody = (req, _res, buf) => {
  req.rawBody = buf ? buf.toString('utf8') : '';
};
app.use(bodyParser.json({ type: '*/*', limit: BODY_LIMIT, verify: captureRawBody }));

app.post('/probe', (_req, res) => {
  res.json({ ok: true, name: 'kakao-provider-mock', version: '0.1.0', capabilities: ['kakao.alimtalk.send'] });
});

app.post('/kakao/alimtalk/send', requireInternalAuth, async (req, res) => {
  try {
    const { tenant_id, template_id, to, vars, trace_id } = req.body || {};
    if (typeof tenant_id !== 'string' || typeof template_id !== 'string' || !Array.isArray(to)) {
      return res.status(400).json({ ok: false, error: 'tenant_id/template_id/to required' });
    }
    if (!tenant_id.trim() || !template_id.trim() || to.length === 0) {
      return res.status(400).json({ ok: false, error: 'tenant_id/template_id/to required' });
    }
    if (tenant_id.length > 128 || template_id.length > 128 || to.length > 100) {
      return res.status(400).json({ ok: false, error: 'request exceeds allowed size' });
    }
    if (!to.every((item) => typeof item === 'string' && item.trim() && item.length <= 64)) {
      return res.status(400).json({ ok: false, error: 'to must contain non-empty recipient strings' });
    }
    if (trace_id !== undefined && (typeof trace_id !== 'string' || !trace_id.trim() || trace_id.length > 128)) {
      return res.status(400).json({ ok: false, error: 'trace_id must be a non-empty string when provided' });
    }
    if (vars !== undefined && (vars === null || Array.isArray(vars) || typeof vars !== 'object')) {
      return res.status(400).json({ ok: false, error: 'vars must be an object when provided' });
    }

    const provider_message_id = `mock-${uuidv4()}`;
    // respond accepted immediately
    res.json({ ok: true, provider_message_id, result: { accepted: to.length, failed: 0 }, error: null });

    // asynchronously simulate delivery event
    const simulatorBody = JSON.stringify({ provider_message_id, tenant_id, template_id, to, vars, trace_id });
    const headers = signedInternalHeaders(INTERNAL_AUTH_TOKEN, 'POST', '/simulate', simulatorBody);

    await fetch(`${SIMULATOR_URL}/simulate`, {
      method: 'POST',
      headers,
      body: simulatorBody
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

function requireInternalAuth(req, res, next) {
  return requireInternalAuthJson(req, res, next, INTERNAL_AUTH_TOKEN);
}

app.listen(PORT, () => console.log(`kakao provider mock listening on :${PORT}`));
