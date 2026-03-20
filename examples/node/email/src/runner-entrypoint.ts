import nodemailer from 'nodemailer';
import { startStdioJsonRuntime } from '../shared/runner-runtime.ts';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

startStdioJsonRuntime({
  pluginName: 'channel-email',
  version: '0.1.0',
  capabilities: ['email.send'],
  async handleInvoke({ capability, input }) {
    if (capability !== 'email.send') {
      fail(`unsupported capability: ${capability}`, 'unsupported_capability');
    }
    if (!SMTP_HOST) {
      fail('SMTP_HOST is not configured', 'not_configured');
    }
    const to = requireString(input?.to, 'to');
    const subject = requireString(input?.subject, 'subject');
    const text = requireString(input?.text, 'text');
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS || undefined } : undefined
    });
    const info = await transporter.sendMail({
      from: SMTP_USER || 'aisopsflow@localhost',
      to,
      subject,
      text
    });
    return { accepted: true, message_id: info.messageId, envelope: info.envelope };
  }
});

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`${field} is required`, 'invalid_request');
  }
  return value.trim();
}

function fail(message, code = 'runtime_error') {
  const error = new Error(message);
  error.code = code;
  throw error;
}
