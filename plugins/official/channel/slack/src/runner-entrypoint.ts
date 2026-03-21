import fetch from 'node-fetch';
import { startStdioJsonRuntime } from '../../../../../packages/js/runner-plugin-runtime/index.ts';

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';

startStdioJsonRuntime({
  pluginName: 'channel-slack',
  version: '0.1.0',
  capabilities: ['slack.send', 'slack.approval'],
  async handleInvoke({ capability, input }) {
    if (!['slack.send', 'slack.approval'].includes(String(capability || ''))) {
      fail(`unsupported capability: ${capability}`, 'unsupported_capability');
    }
    if (!SLACK_BOT_TOKEN) {
      fail('SLACK_BOT_TOKEN is not configured', 'not_configured');
    }
    const target = requireString(input?.target, 'target');
    const text = requireString(input?.text, 'text');
    const blocks = input?.blocks;
    if (blocks !== undefined && !Array.isArray(blocks)) {
      fail('blocks must be an array when provided', 'invalid_request');
    }
    const payload = blocks !== undefined ? { channel: target, text, blocks } : { channel: target, text };
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const body = await response.json();
    if (!response.ok || body?.ok === false) {
      fail(body?.error || `slack send failed with status ${response.status}`, 'provider_error');
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
