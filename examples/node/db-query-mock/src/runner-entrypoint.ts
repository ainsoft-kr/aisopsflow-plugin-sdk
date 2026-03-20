import { startStdioJsonRuntime } from '../shared/runner-runtime.ts';

const MAX_ROWS = process.env.DB_QUERY_MOCK_MAX_ROWS ? Number(process.env.DB_QUERY_MOCK_MAX_ROWS) : 200;

startStdioJsonRuntime({
  pluginName: 'db-query-mock',
  version: '0.1.0',
  capabilities: ['db.read', 'db.explain'],
  async handleInvoke({ capability, input }) {
    if (capability === 'db.read') {
      validateReadRequest(input || {});
      const rows = buildRows(input || {});
      return {
        datasource: input.datasource,
        driver: input.driver,
        columns: inferColumns(rows),
        rows,
        row_count: rows.length,
        truncated: false
      };
    }

    if (capability === 'db.explain') {
      validateReadRequest(input || {});
      return {
        datasource: input.datasource,
        driver: input.driver,
        plan: {
          access: 'mock-sequential-scan',
          read_only: true,
          max_rows: normalizeMaxRows(input.max_rows),
          timeout_seconds: normalizeTimeout(input.timeout_seconds)
        }
      };
    }

    const error = new Error(`unsupported capability: ${capability}`);
    error.code = 'unsupported_capability';
    throw error;
  }
});

function validateReadRequest(body) {
  if (!body || typeof body !== 'object') {
    fail('request body must be an object');
  }
  if (typeof body.datasource !== 'string' || !body.datasource.trim()) {
    fail('datasource is required');
  }
  if (!['postgres', 'mysql'].includes(body.driver)) {
    fail('driver must be postgres or mysql');
  }
  if (typeof body.statement !== 'string' || !body.statement.trim()) {
    fail('statement is required');
  }
  if (/[;]/.test(body.statement)) {
    fail('multi-statement execution is not allowed');
  }
  if (!isReadOnlyStatement(body.statement)) {
    fail('only read-only statements are allowed');
  }
  if (body.params !== undefined && !Array.isArray(body.params)) {
    fail('params must be an array when provided');
  }
  const maxRows = normalizeMaxRows(body.max_rows);
  if (maxRows > MAX_ROWS) {
    fail(`max_rows exceeds limit ${MAX_ROWS}`);
  }
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

function fail(message) {
  const error = new Error(message);
  error.code = 'invalid_request';
  throw error;
}
