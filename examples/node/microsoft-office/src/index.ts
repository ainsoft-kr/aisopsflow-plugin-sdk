import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import { requireInternalAuthJson } from '../shared/internal-auth.ts';

const PORT = process.env.PORT ? Number(process.env.PORT) : 9007;
const INTERNAL_AUTH_TOKEN = process.env.AISOPSFLOW_INTERNAL_AUTH_TOKEN || process.env.INTERNAL_AUTH_TOKEN || '';
const MICROSOFT_GRAPH_ACCESS_TOKEN = process.env.MICROSOFT_GRAPH_ACCESS_TOKEN || '';
const MICROSOFT_GRAPH_BASE_URL = process.env.MICROSOFT_GRAPH_BASE_URL || 'https://graph.microsoft.com/v1.0';
const BODY_LIMIT = '2mb';

const app = express();
const captureRawBody = (req, _res, buf) => {
  req.rawBody = buf ? buf.toString('utf8') : '';
};
app.use(bodyParser.json({ type: '*/*', limit: BODY_LIMIT, verify: captureRawBody }));

app.post('/probe', (_req, res) => {
  res.json({ ok: true, name: 'microsoft-office', version: '0.1.0', capabilities: ['microsoft.office.read', 'microsoft.office.write', 'microsoft.office.delete'] });
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, status: MICROSOFT_GRAPH_ACCESS_TOKEN ? 'healthy' : 'degraded' });
});

app.post('/office/files/get', requireInternalAuth, async (req, res) => {
  try {
    ensureToken();
    const path = resolveDriveItemPath(req.body, false);
    const response = await graphFetch(`${path}?$select=id,name,webUrl,file,size,lastModifiedDateTime`);
    const body = await response.json();
    res.status(response.status).json(body);
  } catch (e) {
    handleError(res, e);
  }
});

app.post('/office/files/create', requireInternalAuth, async (req, res) => {
  try {
    ensureToken();
    const parentPath = resolveParentPath(req.body);
    const name = requireString(req.body?.name, 'name');
    const content = requireString(req.body?.content, 'content');
    const response = await graphFetch(`${parentPath}:/${encodeURIComponent(name)}:/content`, {
      method: 'PUT',
      body: content,
      contentType: req.body?.content_type || 'text/plain; charset=utf-8'
    });
    const body = await response.json();
    res.status(response.status).json(body);
  } catch (e) {
    handleError(res, e);
  }
});

app.post('/office/files/update', requireInternalAuth, async (req, res) => {
  try {
    ensureToken();
    const path = `${resolveDriveItemPath(req.body, true)}/content`;
    const content = requireString(req.body?.content, 'content');
    const response = await graphFetch(path, {
      method: 'PUT',
      body: content,
      contentType: req.body?.content_type || 'text/plain; charset=utf-8'
    });
    const body = await response.json();
    res.status(response.status).json(body);
  } catch (e) {
    handleError(res, e);
  }
});

app.post('/office/files/delete', requireInternalAuth, async (req, res) => {
  try {
    ensureToken();
    const path = resolveDriveItemPath(req.body, true);
    const response = await graphFetch(path, { method: 'DELETE' });
    if (response.status === 204) {
      return res.status(204).send();
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
      'Content-Type': init.contentType || 'application/json'
    },
    body: init.body
  });
}

function resolveDriveItemPath(body, requireItemId) {
  const driveId = optionalString(body?.drive_id);
  const itemId = optionalString(body?.item_id);
  if (requireItemId && !itemId) {
    const error = new Error('item_id is required');
    error.status = 400;
    throw error;
  }
  if (!itemId) {
    const error = new Error('item_id is required');
    error.status = 400;
    throw error;
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
    const error = new Error(`${field} is required`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function handleError(res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  res.status(status).json({ ok: false, error: String(error.message || error) });
}

app.listen(PORT, () => console.log(`microsoft-office plugin listening on :${PORT}`));
