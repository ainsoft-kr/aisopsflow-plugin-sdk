import fetch from 'node-fetch';
import { startStdioJsonRuntime } from '../shared/runner-runtime.ts';

const GMAIL_ACCESS_TOKEN = process.env.GMAIL_ACCESS_TOKEN || '';
const GMAIL_API_BASE_URL = process.env.GMAIL_API_BASE_URL || 'https://gmail.googleapis.com/gmail/v1';

startStdioJsonRuntime({
  pluginName: 'gmail',
  version: '0.1.0',
  capabilities: ['gmail.read', 'gmail.send'],
  async handleInvoke({ capability, input }) {
    ensureToken();

    if (capability === 'gmail.read') {
      const userId = normalizeUserId(input?.user_id);
      const pageSize = normalizePageSize(input?.page_size);
      const params = new URLSearchParams();
      params.set('maxResults', String(pageSize));
      if (typeof input?.query === 'string' && input.query.trim()) {
        params.set('q', input.query.trim());
      }
      if (Array.isArray(input?.label_ids)) {
        for (const label of input.label_ids.filter((v) => typeof v === 'string' && v.trim())) {
          params.append('labelIds', label);
        }
      }

      const response = await gmailFetch(`/users/${encodeURIComponent(userId)}/messages?${params.toString()}`);
      const body = await response.json();
      if (!response.ok) {
        fail(body?.error?.message || `gmail read failed with status ${response.status}`, 'provider_error');
      }
      return body;
    }

    if (capability === 'gmail.send') {
      const userId = normalizeUserId(input?.user_id);
      const to = requireString(input?.to, 'to');
      const subject = requireString(input?.subject, 'subject');
      const text = requireString(input?.text, 'text');
      const mime = renderMimeMessage({
        to,
        cc: optionalString(input?.cc),
        bcc: optionalString(input?.bcc),
        subject,
        text
      });

      const response = await gmailFetch(`/users/${encodeURIComponent(userId)}/messages/send`, {
        method: 'POST',
        body: JSON.stringify({ raw: encodeBase64Url(mime) })
      });
      const body = await response.json();
      if (!response.ok) {
        fail(body?.error?.message || `gmail send failed with status ${response.status}`, 'provider_error');
      }
      return body;
    }

    fail(`unsupported capability: ${capability}`, 'unsupported_capability');
  }
});

function ensureToken() {
  if (!GMAIL_ACCESS_TOKEN) {
    fail('GMAIL_ACCESS_TOKEN is not configured', 'not_configured');
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

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`${field} is required`, 'invalid_request');
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

function fail(message, code = 'runtime_error') {
  const error = new Error(message);
  error.code = code;
  throw error;
}
