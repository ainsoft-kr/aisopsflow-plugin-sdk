import fetch from 'node-fetch';
import { startStdioJsonRuntime } from '../shared/runner-runtime.ts';

const MICROSOFT_GRAPH_ACCESS_TOKEN = process.env.MICROSOFT_GRAPH_ACCESS_TOKEN || '';
const MICROSOFT_GRAPH_BASE_URL = process.env.MICROSOFT_GRAPH_BASE_URL || 'https://graph.microsoft.com/v1.0';

startStdioJsonRuntime({
  pluginName: 'microsoft-office',
  version: '0.1.0',
  capabilities: ['microsoft.office.read', 'microsoft.office.write', 'microsoft.office.delete'],
  async handleInvoke({ capability, input }) {
    ensureToken();

    if (capability === 'microsoft.office.read') {
      const path = resolveDriveItemPath(input, true);
      const response = await graphFetch(`${path}?$select=id,name,webUrl,file,size,lastModifiedDateTime`);
      const body = await response.json();
      if (!response.ok) {
        fail(body?.error?.message || `microsoft office read failed with status ${response.status}`, 'provider_error');
      }
      return body;
    }

    if (capability === 'microsoft.office.write') {
      const mode = typeof input?.mode === 'string' && input.mode.trim() ? input.mode.trim() : 'create';
      const content = requireString(input?.content, 'content');
      if (mode === 'update') {
        const path = `${resolveDriveItemPath(input, true)}/content`;
        const response = await graphFetch(path, {
          method: 'PUT',
          body: content,
          contentType: input?.content_type || 'text/plain; charset=utf-8'
        });
        const body = await response.json();
        if (!response.ok) {
          fail(body?.error?.message || `microsoft office update failed with status ${response.status}`, 'provider_error');
        }
        return body;
      }
      const parentPath = resolveParentPath(input);
      const name = requireString(input?.name, 'name');
      const response = await graphFetch(`${parentPath}:/${encodeURIComponent(name)}:/content`, {
        method: 'PUT',
        body: content,
        contentType: input?.content_type || 'text/plain; charset=utf-8'
      });
      const body = await response.json();
      if (!response.ok) {
        fail(body?.error?.message || `microsoft office create failed with status ${response.status}`, 'provider_error');
      }
      return body;
    }

    if (capability === 'microsoft.office.delete') {
      const path = resolveDriveItemPath(input, true);
      const response = await graphFetch(path, { method: 'DELETE' });
      if (response.status === 204) {
        return { ok: true, deleted: true };
      }
      const body = await response.json();
      if (!response.ok) {
        fail(body?.error?.message || `microsoft office delete failed with status ${response.status}`, 'provider_error');
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
      'Content-Type': init.contentType || 'application/json'
    },
    body: init.body
  });
}

function resolveDriveItemPath(body, requireItemId) {
  const driveId = optionalString(body?.drive_id);
  const itemId = optionalString(body?.item_id);
  if (requireItemId && !itemId) {
    fail('item_id is required', 'invalid_request');
  }
  return driveId
    ? `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`
    : `/me/drive/items/${encodeURIComponent(itemId)}`;
}

function resolveParentPath(body) {
  const driveId = optionalString(body?.drive_id);
  const parentId = optionalString(body?.parent_id) || 'root';
  return driveId
    ? `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}`
    : parentId === 'root'
      ? '/me/drive/root'
      : `/me/drive/items/${encodeURIComponent(parentId)}`;
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
