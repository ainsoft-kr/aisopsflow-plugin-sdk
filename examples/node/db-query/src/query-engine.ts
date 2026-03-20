import mysql from 'mysql2/promise';
import pg from 'pg';

const { Client: PgClient } = pg;
const MAX_ROWS = process.env.DB_QUERY_MAX_ROWS ? Number(process.env.DB_QUERY_MAX_ROWS) : 200;
const DEFAULT_TIMEOUT_SECONDS = process.env.DB_QUERY_DEFAULT_TIMEOUT_SECONDS
  ? Number(process.env.DB_QUERY_DEFAULT_TIMEOUT_SECONDS)
  : 15;

export async function handleDbInvoke(capability: string, input: any) {
  const req = validateReadRequest(input || {});
  const ds = resolveDatasource(req.datasource, req.driver);
  if (capability === 'db.read') return runRead(ds, req);
  if (capability === 'db.explain') return runExplain(ds, req);
  const error: any = new Error(`unsupported capability: ${capability}`);
  error.code = 'unsupported_capability';
  throw error;
}

export function validateReadRequest(body: any) {
  if (!body || typeof body !== 'object') fail('request body must be an object');
  if (typeof body.datasource !== 'string' || !body.datasource.trim()) fail('datasource is required');
  if (!['postgres', 'mysql'].includes(body.driver)) fail('driver must be postgres or mysql');
  if (typeof body.statement !== 'string' || !body.statement.trim()) fail('statement is required');
  if (/[;]/.test(body.statement)) fail('multi-statement execution is not allowed');
  if (!isReadOnlyStatement(body.statement)) fail('only read-only statements are allowed');
  if (body.params !== undefined && !Array.isArray(body.params)) fail('params must be an array when provided');

  return {
    datasource: body.datasource.trim(),
    driver: body.driver,
    statement: body.statement.trim(),
    params: Array.isArray(body.params) ? body.params : [],
    maxRows: normalizeMaxRows(body.max_rows),
    timeoutSeconds: normalizeTimeout(body.timeout_seconds)
  };
}

function resolveDatasource(datasource: string, driver: string) {
  let parsed: any = {};
  try {
    parsed = JSON.parse(process.env.DB_QUERY_DATASOURCES_JSON || '{}');
  } catch (_error) {
    fail('DB_QUERY_DATASOURCES_JSON must be valid JSON');
  }
  const config = parsed?.[datasource];
  if (!config || typeof config !== 'object') fail(`datasource is not configured: ${datasource}`);
  const resolvedDriver = typeof config.driver === 'string' && config.driver ? config.driver : driver;
  if (resolvedDriver !== driver) fail(`datasource driver mismatch for ${datasource}`);
  if (typeof config.url !== 'string' || !config.url.trim()) fail(`datasource url is missing for ${datasource}`);
  return { name: datasource, driver: resolvedDriver, url: config.url.trim() };
}

async function runRead(ds: any, req: any) {
  if (ds.driver === 'postgres') {
    const client = new PgClient({
      connectionString: ds.url,
      statement_timeout: req.timeoutSeconds * 1000,
      query_timeout: req.timeoutSeconds * 1000
    });
    await client.connect();
    try {
      const result = await client.query({ text: req.statement, values: req.params });
      const rows = Array.isArray(result.rows) ? result.rows.slice(0, req.maxRows) : [];
      return {
        datasource: ds.name,
        driver: ds.driver,
        columns: result.fields.map((field: any) => field.name),
        rows,
        row_count: rows.length,
        truncated: result.rows.length > rows.length
      };
    } finally {
      await client.end().catch(() => {});
    }
  }

  const connection = await mysql.createConnection({
    uri: ds.url,
    connectTimeout: req.timeoutSeconds * 1000
  });
  try {
    const [rows, fields] = await connection.execute(
      { sql: req.statement, timeout: req.timeoutSeconds * 1000, rowsAsArray: false } as any,
      req.params
    );
    const normalizedRows = Array.isArray(rows) ? rows.slice(0, req.maxRows) : [];
    return {
      datasource: ds.name,
      driver: ds.driver,
      columns: Array.isArray(fields) ? fields.map((field: any) => field.name) : inferColumns(normalizedRows),
      rows: normalizedRows,
      row_count: normalizedRows.length,
      truncated: Array.isArray(rows) ? rows.length > normalizedRows.length : false
    };
  } finally {
    await connection.end().catch(() => {});
  }
}

async function runExplain(ds: any, req: any) {
  const explainSql = `EXPLAIN ${req.statement}`;
  if (ds.driver === 'postgres') {
    const client = new PgClient({
      connectionString: ds.url,
      statement_timeout: req.timeoutSeconds * 1000,
      query_timeout: req.timeoutSeconds * 1000
    });
    await client.connect();
    try {
      const result = await client.query({ text: explainSql, values: req.params });
      return {
        datasource: ds.name,
        driver: ds.driver,
        plan: {
          read_only: true,
          format: 'text',
          steps: result.rows.map((row: any) => row['QUERY PLAN']).filter(Boolean)
        }
      };
    } finally {
      await client.end().catch(() => {});
    }
  }

  const connection = await mysql.createConnection({
    uri: ds.url,
    connectTimeout: req.timeoutSeconds * 1000
  });
  try {
    const [rows] = await connection.execute(
      { sql: explainSql, timeout: req.timeoutSeconds * 1000, rowsAsArray: false } as any,
      req.params
    );
    return {
      datasource: ds.name,
      driver: ds.driver,
      plan: {
        read_only: true,
        format: 'rows',
        steps: Array.isArray(rows) ? rows : []
      }
    };
  } finally {
    await connection.end().catch(() => {});
  }
}

function isReadOnlyStatement(statement: string) {
  const normalized = String(statement || '').trim().toLowerCase();
  if (!normalized.startsWith('select') && !normalized.startsWith('with')) return false;
  return !/\b(insert|update|delete|alter|drop|truncate|grant|revoke|create|replace)\b/.test(normalized);
}

function normalizeMaxRows(value: any) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return Math.min(50, MAX_ROWS);
  return Math.min(Math.floor(parsed), MAX_ROWS);
}

function normalizeTimeout(value: any) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_SECONDS;
  return Math.min(Math.floor(parsed), 60);
}

function inferColumns(rows: any[]) {
  return rows.length > 0 && rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]) : [];
}

function fail(message: string): never {
  const error: any = new Error(message);
  error.code = 'invalid_request';
  throw error;
}
