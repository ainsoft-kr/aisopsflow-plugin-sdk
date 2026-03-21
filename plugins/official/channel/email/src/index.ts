import express from 'express';
import bodyParser from 'body-parser';
import nodemailer from 'nodemailer';
import { requireInternalAuthJson } from '../../../../../packages/js/internal-auth/internal-auth.ts';

const PORT = process.env.PORT ? Number(process.env.PORT) : 9001;

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const INTERNAL_AUTH_TOKEN = process.env.AISOPSFLOW_INTERNAL_AUTH_TOKEN || process.env.INTERNAL_AUTH_TOKEN || '';
const BODY_LIMIT = '32kb';

const transporter = SMTP_HOST ? nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
}) : null;

const app = express();
const captureRawBody = (req, _res, buf) => {
  req.rawBody = buf ? buf.toString('utf8') : '';
};
app.use(bodyParser.json({ type: '*/*', limit: BODY_LIMIT, verify: captureRawBody }));

app.post('/probe', (_req, res) => {
  res.json({ ok: true, name: 'channel-email', version: '0.1.0', capabilities: ['email.send'] });
});

// Core -> Email: { to, subject, text }
app.post('/send', requireInternalAuth, async (req, res) => {
  try {
    if (!transporter) return res.status(500).json({ ok: false, error: 'SMTP not configured' });
    const { to, subject, text } = req.body || {};
    if (typeof to !== 'string' || typeof subject !== 'string' || typeof text !== 'string') {
      return res.status(400).json({ ok: false, error: 'to/subject/text must be strings' });
    }
    if (!to.trim() || !subject.trim() || !text.trim()) {
      return res.status(400).json({ ok: false, error: 'to/subject/text required' });
    }
    if (to.length > 320 || subject.length > 200 || text.length > 20000) {
      return res.status(400).json({ ok: false, error: 'to/subject/text too long' });
    }

    const info = await transporter.sendMail({
      from: SMTP_USER || 'aisopsflow@localhost',
      to,
      subject,
      text
    });

    res.json({ ok: true, info });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

function requireInternalAuth(req, res, next) {
  return requireInternalAuthJson(req, res, next, INTERNAL_AUTH_TOKEN);
}

app.listen(PORT, () => console.log(`email plugin listening on :${PORT}`));
