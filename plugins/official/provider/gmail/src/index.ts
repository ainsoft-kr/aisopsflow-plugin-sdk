import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import { requireInternalAuthJson } from '../../../../../packages/js/internal-auth/internal-auth.ts';

const PORT = process.env.PORT ? Number(process.env.PORT) : 9005;
const INTERNAL_AUTH_TOKEN = process.env.AISOPSFLOW_INTERNAL_AUTH_TOKEN || process.env.INTERNAL_AUTH_TOKEN || '';
const GMAIL_ACCESS_TOKEN = process.env.GMAIL_ACCESS_TOKEN || '';
const GMAIL_API_BASE_URL = process.env.GMAIL_API_BASE_URL || 'https://gmail.googleapis.com/gmail/v1';
const BODY_LIMIT = '64kb';

const app = express();
const captureRawBody = (req, _res, buf) => {
  req.rawBody = buf ? buf.toString('utf8') : '';
};
app.use(bodyParser.json({ type: '*/*', limit: BODY_LIMIT, verify: captureRawBody }));

app.post('/probe', (_req, res) => {
  res.json({ ok: true, name: 'gmail', version: '0.1.0', capabilities: ['gmail.read', 'gmail.send'] });
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, status: GMAIL_ACCESS_TOKEN ? 'healthy' : 'degraded' });
});

app.post('/gmail/messages/list', requireInternalAuth, async (req, res) => {
  try {
    ensureToken();
    const userId = normalizeUserId(req.body?.user_id);
    const pageSize = normalizePageSize(req.body?.page_size);
    const params = new URLSearchParams();
    params.set('maxResults', String(pageSize));
    if (typeof req.body?.query === 'string' && req.body.query.trim()) {
      params.set('q', req.body.query.trim());
    }
    if (Array.isArray(req.body?.label_ids)) {
      for (const label of req.body.label_ids.filter((v) => typeof v === 'string' && v.trim())) {
        params.append('labelIds', label);
      }
    }

    const response = await gmailFetch(`/users/${encodeURIComponent(userId)}/messages?${params.toString()}`);
    const body = await response.json();
    res.status(response.status).json(body);
  } catch (e) {
    handleError(res, e);
  }
});

app.post('/gmail/messages/get', requireInternalAuth, async (req, res) => {
  try {
    ensureToken();
    const userId = normalizeUserId(req.body?.user_id);
    const messageId = requireString(req.body?.message_id, 'message_id');
    const format = normalizeFormat(req.body?.format);
    const response = await gmailFetch(`/users/${encodeURIComponent(userId)}/messages/${encodeURIComponent(messageId)}?format=${encodeURIComponent(format)}`);
    const body = await response.json();
    res.status(response.status).json(body);
  } catch (e) {
    handleError(res, e);
  }
});

app.post('/gmail/messages/send', requireInternalAuth, async (req, res) => {
  try {
    ensureToken();
    const userId = normalizeUserId(req.body?.user_id);
    const to = requireString(req.body?.to, 'to');
    const subject = requireString(req.body?.subject, 'subject');
    const text = requireString(req.body?.text, 'text');
    const mime = renderMimeMessage({
      to,
      cc: optionalString(req.body?.cc),
      bcc: optionalString(req.body?.bcc),
      subject,
      text
    });

    const response = await gmailFetch(`/users/${encodeURIComponent(userId)}/messages/send`, {
      method: 'POST',
      body: JSON.stringify({ raw: encodeBase64Url(mime) })
    });
    const body = await response.json();
    res.status(response.status).json(body);
  } catch (e) {
    handleError(res, e);
  }
});

function requireInternalAuth(req, res, next) {
  return requireInternalAuthJson(req, res, next, INTERNAL_AUTH_TOKEN);
}

function ensureToken() {
  if (!GMAIL_ACCESS_TOKEN) {
    const error = new Error('GMAIL_ACCESS_TOKEN is not configured');
    error.status = 503;
    throw error;
  }
}

async function gmailFetch(path, init = {}) {
  return fetch(`${GMAIL_API_BASE_URL}${path}`, {
    method: init.method || 'GET',
    headers: {
      Authorization: `Bearer ${GMAIL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: init.body
  });
}

function normalizeUserId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : 'me';
}

function normalizePageSize(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 25;
  }
  return Math.min(Math.floor(parsed), 100);
}

function normalizeFormat(value) {
  const allowed = new Set(['full', 'metadata', 'minimal', 'raw']);
  return allowed.has(value) ? value : 'full';
}

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    const error = new Error(`${field} is required`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function renderMimeMessage({ to, cc, bcc, subject, text }) {
  const headers = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset=UTF-8', 'MIME-Version: 1.0'];
  if (cc) headers.push(`Cc: ${cc}`);
  if (bcc) headers.push(`Bcc: ${bcc}`);
  return `${headers.join('\r\n')}\r\n\r\n${text}`;
}

function encodeBase64Url(input) {
  return Buffer.from(input, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function handleError(res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  res.status(status).json({ ok: false, error: String(error.message || error) });
}

app.listen(PORT, () => console.log(`gmail plugin listening on :${PORT}`));
