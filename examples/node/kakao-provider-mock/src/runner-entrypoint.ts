import fetch from 'node-fetch';
import { randomUUID } from 'node:crypto';
import { startStdioJsonRuntime } from '../shared/runner-runtime.ts';

const SIMULATOR_URL = process.env.SIMULATOR_URL || 'http://kakao_simulator:9010';
const INTERNAL_AUTH_TOKEN = process.env.AISOPSFLOW_INTERNAL_AUTH_TOKEN || process.env.INTERNAL_AUTH_TOKEN || '';

startStdioJsonRuntime({
  pluginName: 'kakao-provider-mock',
  version: '0.1.0',
  capabilities: ['kakao.alimtalk.send'],
  async handleInvoke({ capability, input }) {
    if (capability !== 'kakao.alimtalk.send') {
      fail(`unsupported capability: ${capability}`, 'unsupported_capability');
    }
    const tenantId = requireString(input?.tenant_id, 'tenant_id');
    const templateId = requireString(input?.template_id, 'template_id');
    const to = normalizeRecipients(input?.to);
    const vars = normalizeObject(input?.vars, 'vars');
    const traceId = optionalString(input?.trace_id);
    const providerMessageId = `mock-${randomUUID()}`;
    if (SIMULATOR_URL) {
      const payload = {
        provider_message_id: providerMessageId,
        tenant_id: tenantId,
        template_id: templateId,
        to,
        vars,
        trace_id: traceId
      };
      void fetch(`${SIMULATOR_URL}/simulate`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(payload)
      }).catch(() => undefined);
    }
    return { ok: true, provider_message_id: providerMessageId, result: { accepted: to.length, failed: 0 } };
  }
});

function buildHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (INTERNAL_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${INTERNAL_AUTH_TOKEN}`;
  }
  return headers;
}

function normalizeRecipients(value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail('to is required', 'invalid_request');
  }
  const recipients = value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
  if (recipients.length === 0) {
    fail('to must contain at least one recipient', 'invalid_request');
  }
  return recipients;
}

function normalizeObject(value, field) {
  if (value === undefined || value === null) {
    return {};
  }
  if (Array.isArray(value) || typeof value !== 'object') {
    fail(`${field} must be an object when provided`, 'invalid_request');
  }
  return value;
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

function fail(message, code = 'runtime_error') {
  const error = new Error(message);
  error.code = code;
  throw error;
}
