import express from 'express';
import bodyParser from 'body-parser';
import { requireInternalAuthJson } from '../shared/internal-auth.ts';
import { handleDbInvoke } from './query-engine.ts';

const PORT = process.env.PORT ? Number(process.env.PORT) : 9004;
const INTERNAL_AUTH_TOKEN = process.env.AISOPSFLOW_INTERNAL_AUTH_TOKEN || process.env.INTERNAL_AUTH_TOKEN || '';
const BODY_LIMIT = '32kb';

const app = express();

const captureRawBody = (req, _res, buf) => {
  req.rawBody = buf ? buf.toString('utf8') : '';
};

app.use(bodyParser.json({ type: '*/*', limit: BODY_LIMIT, verify: captureRawBody }));

app.post('/probe', (_req, res) => {
  res.json({
    ok: true,
    name: 'db-query',
    version: '0.2.0',
    capabilities: ['db.read', 'db.explain']
  });
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, status: 'healthy' });
});

app.post('/query/read', requireInternalAuth, async (req, res) => {
  try {
    const result = await handleDbInvoke('db.read', req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'query failed' });
  }
});

app.post('/query/explain', requireInternalAuth, async (req, res) => {
  try {
    const result = await handleDbInvoke('db.explain', req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'explain failed' });
  }
});

function requireInternalAuth(req, res, next) {
  return requireInternalAuthJson(req, res, next, INTERNAL_AUTH_TOKEN);
}

app.listen(PORT, () => {
  console.log(`db-query plugin listening on :${PORT}`);
});
