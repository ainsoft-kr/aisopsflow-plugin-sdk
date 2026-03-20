import fetch from 'node-fetch';
import { startStdioJsonRuntime } from '../shared/runner-runtime.ts';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

startStdioJsonRuntime({
  pluginName: 'channel-telegram',
  version: '0.1.0',
  capabilities: ['telegram.send'],
  async handleInvoke({ capability, input }) {
    if (capability !== 'telegram.send') {
      fail(`unsupported capability: ${capability}`, 'unsupported_capability');
    }
    if (!BOT_TOKEN) {
      fail('TELEGRAM_BOT_TOKEN is not configured', 'not_configured');
    }
    const chatId = input?.chat_id;
    const text = requireString(input?.text, 'text');
    if (!(typeof chatId === 'string' || typeof chatId === 'number')) {
      fail('chat_id is required', 'invalid_request');
    }
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    const body = await response.json();
    if (!response.ok || body?.ok === false) {
      fail(body?.description || `telegram send failed with status ${response.status}`, 'provider_error');
    }
    return body;
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
