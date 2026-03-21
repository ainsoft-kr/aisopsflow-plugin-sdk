import fetch from 'node-fetch';
import { startStdioJsonRuntime } from '../../../../../packages/js/runner-plugin-runtime/index.ts';

startStdioJsonRuntime({
  pluginName: 'http-client',
  version: '0.1.0',
  capabilities: ['http.request'],
  async handleInvoke({ capability, input }) {
    if (capability !== 'http.request') {
      fail(`unsupported capability: ${capability}`, 'unsupported_capability');
    }
    const method = typeof input?.method === 'string' && input.method.trim() ? input.method.trim().toUpperCase() : 'GET';
    const url = requireString(input?.url, 'url');
    const headers = normalizeHeaders(input?.headers);
    const body = resolveBody(input);
    const response = await fetch(url, { method, headers, body });
    const responseText = await response.text();
    const headerEntries = Object.fromEntries(response.headers.entries());
    return {
      status: response.status,
      ok: response.ok,
      body: responseText,
      headers: headerEntries
    };
  }
});

function normalizeHeaders(value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, headerValue]) => typeof key === 'string' && key.trim() && headerValue != null)
      .map(([key, headerValue]) => [key.trim(), String(headerValue)])
  );
}

function resolveBody(input: any) {
  if (typeof input?.body === 'string') {
    return input.body;
  }
  if (typeof input?.body_json === 'string') {
    return input.body_json;
  }
  if (input?.json !== undefined) {
    return JSON.stringify(input.json);
  }
  return undefined;
}

function requireString(value: any, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`${field} is required`, 'invalid_request');
  }
  return value.trim();
}

function fail(message: string, code = 'runtime_error'): never {
  const error: any = new Error(message);
  error.code = code;
  throw error;
}
