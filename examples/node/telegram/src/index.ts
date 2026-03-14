import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import { requireInternalAuthJson } from '../shared/internal-auth.ts';

const PORT = process.env.PORT ? Number(process.env.PORT) : 9002;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const INTERNAL_AUTH_TOKEN = process.env.AISOPSFLOW_INTERNAL_AUTH_TOKEN || process.env.INTERNAL_AUTH_TOKEN || '';
const BODY_LIMIT = '32kb';

const app = express();
const captureRawBody = (req, _res, buf) => {
  req.rawBody = buf ? buf.toString('utf8') : '';
};
app.use(bodyParser.json({ type: '*/*', limit: BODY_LIMIT, verify: captureRawBody }));

app.post('/probe', (_req, res) => {
  res.json({ ok: true, name: 'channel-telegram', version: '0.1.0', capabilities: ['send.telegram'] });
});

// Core -> Telegram: { chat_id, text }
app.post('/send', requireInternalAuth, async (req, res) => {
  try {
    const { chat_id, text } = req.body || {};
    const chatIdOk = typeof chat_id === 'string' || typeof chat_id === 'number';
    if (!chatIdOk || typeof text !== 'string') {
      return res.status(400).json({ ok: false, error: 'chat_id and text are required' });
    }
    if (!String(chat_id).trim() || !text.trim()) {
      return res.status(400).json({ ok: false, error: 'chat_id/text required' });
    }
    if (String(chat_id).length > 64 || text.length > 4000) {
      return res.status(400).json({ ok: false, error: 'chat_id or text too long' });
    }

    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text })
    });
    const j = await r.json();
    res.json({ ok: Boolean(j.ok), telegram: j });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

function requireInternalAuth(req, res, next) {
  return requireInternalAuthJson(req, res, next, INTERNAL_AUTH_TOKEN);
}

app.listen(PORT, () => console.log(`telegram plugin listening on :${PORT}`));
