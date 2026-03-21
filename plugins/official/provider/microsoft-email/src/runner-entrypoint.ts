import fetch from 'node-fetch';
import { startStdioJsonRuntime } from '../../../../../packages/js/runner-plugin-runtime/index.ts';

const MICROSOFT_GRAPH_ACCESS_TOKEN = process.env.MICROSOFT_GRAPH_ACCESS_TOKEN || '';
const MICROSOFT_GRAPH_BASE_URL = process.env.MICROSOFT_GRAPH_BASE_URL || 'https://graph.microsoft.com/v1.0';

startStdioJsonRuntime({
  pluginName: 'microsoft-email',
  version: '0.1.0',
  capabilities: ['microsoft.mail.read', 'microsoft.mail.send'],
  async handleInvoke({ capability, input }) {
    ensureToken();

    if (capability === 'microsoft.mail.read') {
      const userId = normalizeUserId(input?.user_id);
      const top = normalizeTop(input?.top);
      const params = new URLSearchParams();
      params.set('$top', String(top));
      params.set('$select', 'id,subject,from,receivedDateTime,isRead,bodyPreview');
      if (typeof input?.filter === 'string' && input.filter.trim()) {
        params.set('$filter', input.filter.trim());
      }
      if (typeof input?.search === 'string' && input.search.trim()) {
        params.set('$search', `"${input.search.trim()}"`);
      }
      const folder = typeof input?.folder_id === 'string' && input.folder_id.trim()
        ? `/mailFolders/${encodeURIComponent(input.folder_id.trim())}`
        : '';
      const response = await graphFetch(`/users/${encodeURIComponent(userId)}${folder}/messages?${params.toString()}`);
      const body = await response.json();
      if (!response.ok) {
        fail(body?.error?.message || `microsoft mail read failed with status ${response.status}`, 'provider_error');
      }
      return body;
    }

    if (capability === 'microsoft.mail.send') {
      const userId = normalizeUserId(input?.user_id);
      const subject = requireString(input?.subject, 'subject');
      const text = requireString(input?.text, 'text');
      const toRecipients = normalizeRecipients(input?.to, 'to');
      const ccRecipients = normalizeRecipients(input?.cc);
      const bccRecipients = normalizeRecipients(input?.bcc);
      const response = await graphFetch(`/users/${encodeURIComponent(userId)}/sendMail`, {
        method: 'POST',
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: 'Text', content: text },
            toRecipients,
            ccRecipients,
            bccRecipients
          },
          saveToSentItems: true
        })
      });
      if (response.status === 202) {
        return { ok: true, accepted: true };
      }
      const body = await response.json();
      if (!response.ok) {
        fail(body?.error?.message || `microsoft mail send failed with status ${response.status}`, 'provider_error');
      }
      return body;
    }

    fail(`unsupported capability: ${capability}`, 'unsupported_capability');
  }
});

function ensureToken() {
  if (!MICROSOFT_GRAPH_ACCESS_TOKEN) {
    fail('MICROSOFT_GRAPH_ACCESS_TOKEN is not configured', 'not_configured');
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
    fail(`${field} is required`, 'invalid_request');
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
    fail(`${requiredField} is required`, 'invalid_request');
  }
  return values
    .filter((item) => typeof item === 'string' && item.trim())
    .map((address) => ({ emailAddress: { address: address.trim() } }));
}

function fail(message, code = 'runtime_error') {
  const error = new Error(message);
  error.code = code;
  throw error;
}
