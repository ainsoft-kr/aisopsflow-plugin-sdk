import express from 'express';
import bodyParser from 'body-parser';
import { requireInternalAuthJson } from '../../../../../packages/js/internal-auth/internal-auth.ts';
import { handleKakaoInvoke } from './provider-engine.ts';

const PORT = process.env.PORT ? Number(process.env.PORT) : 9011;
const INTERNAL_AUTH_TOKEN = process.env.AISOPSFLOW_INTERNAL_AUTH_TOKEN || process.env.INTERNAL_AUTH_TOKEN || '';
const BODY_LIMIT = '64kb';

const app = express();
const captureRawBody = (req, _res, buf) => {
  req.rawBody = buf ? buf.toString('utf8') : '';
};
app.use(bodyParser.json({ type: '*/*', limit: BODY_LIMIT, verify: captureRawBody }));

app.post('/probe', (_req, res) => {
  res.json({ ok: true, name: 'kakao-provider', version: '0.2.0', capabilities: ['kakao.alimtalk.send'] });
});

app.post('/kakao/alimtalk/send', requireInternalAuth, async (req, res) => {
  try {
    const result = await handleKakaoInvoke('kakao.alimtalk.send', req.body || {});
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

function requireInternalAuth(req, res, next) {
  return requireInternalAuthJson(req, res, next, INTERNAL_AUTH_TOKEN);
}

app.listen(PORT, () => console.log(`kakao provider listening on :${PORT}`));
