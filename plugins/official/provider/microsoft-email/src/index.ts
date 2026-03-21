import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import { requireInternalAuthJson } from '../../../../../packages/js/internal-auth/internal-auth.ts';

const PORT = process.env.PORT ? Number(process.env.PORT) : 9006;
const INTERNAL_AUTH_TOKEN = process.env.AISOPSFLOW_INTERNAL_AUTH_TOKEN || process.env.INTERNAL_AUTH_TOKEN || '';
const MICROSOFT_GRAPH_ACCESS_TOKEN = process.env.MICROSOFT_GRAPH_ACCESS_TOKEN || '';
const MICROSOFT_GRAPH_BASE_URL = process.env.MICROSOFT_GRAPH_BASE_URL || 'https://graph.microsoft.com/v1.0';
const BODY_LIMIT = '64kb';

const app = express();
const captureRawBody = (req, _res, buf) => {
  req.rawBody = buf ? buf.toString('utf8') : '';
};
app.use(bodyParser.json({ type: '*/*', limit: BODY_LIMIT, verify: captureRawBody }));

app.post('/probe', (_req, res) => {
  res.json({ ok: true, name: 'microsoft-email', version: '0.1.0', capabilities: ['microsoft.mail.read', 'microsoft.mail.send'] });
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, status: MICROSOFT_GRAPH_ACCESS_TOKEN ? 'healthy' : 'degraded' });
});

app.post('/mail/messages/list', requireInternalAuth, async (req, res) => {
  try {
    ensureToken();
    const userId = normalizeUserId(req.body?.user_id);
    const top = normalizeTop(req.body?.top);
    const params = new URLSearchParams();
    params.set('$top', String(top));
    params.set('$select', 'id,subject,from,receivedDateTime,isRead,bodyPreview');
    if (typeof req.body?.filter === 'string' && req.body.filter.trim()) {
      params.set('$filter', req.body.filter.trim());
    }
    if (typeof req.body?.search === 'string' && req.body.search.trim()) {
      params.set('$search', `"${req.body.search.trim()}"`);
    }
    const folder = typeof req.body?.folder_id === 'string' && req.body.folder_id.trim()
      ? `/mailFolders/${encodeURIComponent(req.body.folder_id.trim())}`
      : '';
    const response = await graphFetch(`/users/${encodeURIComponent(userId)}${folder}/messages?${params.toString()}`);
    const body = await response.json();
    res.status(response.status).json(body);
  } catch (e) {
    handleError(res, e);
  }
});

app.post('/mail/messages/get', requireInternalAuth, async (req, res) => {
  try {
    ensureToken();
    const userId = normalizeUserId(req.body?.user_id);
    const messageId = requireString(req.body?.message_id, 'message_id');
    const response = await graphFetch(`/users/${encodeURIComponent(userId)}/messages/${encodeURIComponent(messageId)}`);
    const body = await response.json();
    res.status(response.status).json(body);
  } catch (e) {
    handleError(res, e);
  }
});

app.post('/mail/messages/send', requireInternalAuth, async (req, res) => {
  try {
    ensureToken();
    const userId = normalizeUserId(req.body?.user_id);
    const subject = requireString(req.body?.subject, 'subject');
    const text = requireString(req.body?.text, 'text');
    const toRecipients = normalizeRecipients(req.body?.to, 'to');
    const ccRecipients = normalizeRecipients(req.body?.cc);
    const bccRecipients = normalizeRecipients(req.body?.bcc);

    const response = await graphFetch(`/users/${encodeURIComponent(userId)}/sendMail`, {
      method: 'POST',
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: 'Text',
            content: text
          },
          toRecipients,
          ccRecipients,
          bccRecipients
        },
        saveToSentItems: true
      })
    });

    if (response.status === 202) {
      return res.status(202).json({ ok: true, accepted: true });
    }
    const body = await response.json();
    return res.status(response.status).json(body);
  } catch (e) {
    handleError(res, e);
  }
});

function requireInternalAuth(req, res, next) {
  return requireInternalAuthJson(req, res, next, INTERNAL_AUTH_TOKEN);
}

function ensureToken() {
  if (!MICROSOFT_GRAPH_ACCESS_TOKEN) {
    const error = new Error('MICROSOFT_GRAPH_ACCESS_TOKEN is not configured');
    error.status = 503;
    throw error;
  }
}

async function graphFetch(path, init = {}) {
  return fetch(`${MICROSOFT_GRAPH_BASE_URL}${path}`, {
    method: init.method || 'GET',
    headers: {
      Authorization: `Bearer ${MICROSOFT_GRAPH_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: init.body
  });
}

function normalizeUserId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : 'me';
}

function normalizeTop(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 25;
  }
  return Math.min(Math.floor(parsed), 100);
}

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    const error = new Error(`${field} is required`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

function normalizeRecipients(value, requiredField) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.trim()
      ? [value.trim()]
      : [];
  if (requiredField && values.length === 0) {
    const error = new Error(`${requiredField} is required`);
    error.status = 400;
    throw error;
  }
  return values
    .filter((item) => typeof item === 'string' && item.trim())
    .map((address) => ({ emailAddress: { address: address.trim() } }));
}

function handleError(res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  res.status(status).json({ ok: false, error: String(error.message || error) });
}

app.listen(PORT, () => console.log(`microsoft-email plugin listening on :${PORT}`));
