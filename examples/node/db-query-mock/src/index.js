import express from 'express';
import bodyParser from 'body-parser';
import { requireInternalAuthJson } from '../shared/internal-auth.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 9004;
const INTERNAL_AUTH_TOKEN = process.env.AISOPSFLOW_INTERNAL_AUTH_TOKEN || process.env.INTERNAL_AUTH_TOKEN || '';
const BODY_LIMIT = '32kb';
const MAX_ROWS = process.env.DB_QUERY_MOCK_MAX_ROWS ? Number(process.env.DB_QUERY_MOCK_MAX_ROWS) : 200;

const app = express();

const captureRawBody = (req, _res, buf) => {
  req.rawBody = buf ? buf.toString('utf8') : '';
};

app.use(bodyParser.json({ type: '*/*', limit: BODY_LIMIT, verify: captureRawBody }));

app.post('/probe', (_req, res) => {
  res.json({
    ok: true,
    name: 'db-query-mock',
    version: '0.1.0',
    capabilities: ['db.read', 'db.explain', 'mock']
  });
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, status: 'healthy' });
});

app.post('/query/read', requireInternalAuth, (req, res) => {
  const validation = validateReadRequest(req.body || {});
  if (!validation.ok) {
    return res.status(validation.status).json({ ok: false, error: validation.error });
  }

  const body = req.body || {};
  const rows = buildRows(body);

  return res.json({
    ok: true,
    datasource: body.datasource,
    driver: body.driver,
    columns: inferColumns(rows),
    rows,
    row_count: rows.length,
    truncated: false,
    duration_ms: 5
  });
});

app.post('/query/explain', requireInternalAuth, (req, res) => {
  const validation = validateReadRequest(req.body || {});
  if (!validation.ok) {
    return res.status(validation.status).json({ ok: false, error: validation.error });
  }

  const body = req.body || {};
  return res.json({
    ok: true,
    datasource: body.datasource,
    driver: body.driver,
    plan: {
      access: 'mock-sequential-scan',
      read_only: true,
      max_rows: normalizeMaxRows(body.max_rows),
      timeout_seconds: normalizeTimeout(body.timeout_seconds)
    }
  });
});

function requireInternalAuth(req, res, next) {
  return requireInternalAuthJson(req, res, next, INTERNAL_AUTH_TOKEN);
}

function validateReadRequest(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'request body must be an object' };
  }
  if (typeof body.datasource !== 'string' || !body.datasource.trim()) {
    return { ok: false, status: 400, error: 'datasource is required' };
  }
  if (!['postgres', 'mysql'].includes(body.driver)) {
    return { ok: false, status: 400, error: 'driver must be postgres or mysql' };
  }
  if (typeof body.statement !== 'string' || !body.statement.trim()) {
    return { ok: false, status: 400, error: 'statement is required' };
  }
  if (/[;]/.test(body.statement)) {
    return { ok: false, status: 400, error: 'multi-statement execution is not allowed' };
  }
  if (!isReadOnlyStatement(body.statement)) {
    return { ok: false, status: 400, error: 'only read-only statements are allowed' };
  }
  if (body.params !== undefined && !Array.isArray(body.params)) {
    return { ok: false, status: 400, error: 'params must be an array when provided' };
  }
  const maxRows = normalizeMaxRows(body.max_rows);
  if (maxRows > MAX_ROWS) {
    return { ok: false, status: 400, error: `max_rows exceeds limit ${MAX_ROWS}` };
  }
  return { ok: true };
}

function isReadOnlyStatement(statement) {
  const normalized = String(statement || '').trim().toLowerCase();
  if (!normalized.startsWith('select') && !normalized.startsWith('with')) {
    return false;
  }
  return !/\b(insert|update|delete|alter|drop|truncate|grant|revoke|create|replace)\b/.test(normalized);
}

function normalizeMaxRows(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(Math.floor(parsed), MAX_ROWS);
}

function normalizeTimeout(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 15;
  }
  return Math.min(Math.floor(parsed), 60);
}

function buildRows(body) {
  const limit = Math.min(normalizeMaxRows(body.max_rows), 3);
  const rows = [];
  for (let i = 0; i < limit; i += 1) {
    rows.push({
      id: i + 1,
      datasource: body.datasource,
      driver: body.driver,
      statement_preview: String(body.statement).slice(0, 80),
      params_count: Array.isArray(body.params) ? body.params.length : 0
    });
  }
  return rows;
}

function inferColumns(rows) {
  return rows.length > 0 ? Object.keys(rows[0]) : [];
}

app.listen(PORT, () => {
  console.log(`db-query-mock plugin listening on :${PORT}`);
});
