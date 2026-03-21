import crypto from 'node:crypto';
import fetch from 'node-fetch';
import { startStdioJsonRuntime } from '../../../../../packages/js/runner-plugin-runtime/index.ts';

const INTERNAL_AUTH_TOKEN = process.env.AISOPSFLOW_INTERNAL_AUTH_TOKEN || '';
const CORE_API_BASE_URL = process.env.CORE_API_BASE_URL || 'http://core:8080';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';

startStdioJsonRuntime({
  pluginName: 'internal-approval',
  version: '0.1.0',
  capabilities: ['approval.wait'],
  async handleInvoke({ capability, input }) {
    if (capability !== 'approval.wait') {
      fail(`unsupported capability: ${capability}`, 'unsupported_capability');
    }
    if (!INTERNAL_AUTH_TOKEN) {
      fail('AISOPSFLOW_INTERNAL_AUTH_TOKEN is not configured', 'not_configured');
    }
    if (!SLACK_BOT_TOKEN) {
      fail('SLACK_BOT_TOKEN is not configured', 'not_configured');
    }
    const channel = requireString(input?.channel, 'channel');
    const message = requireString(input?.message, 'message');
    const executionId = requireString(input?.execution_id, 'execution_id');
    const stepId = requireString(input?.step_id, 'step_id');
    const timeoutSeconds = normalizeTimeout(input?.timeout_seconds);

    await sendSlackApproval(channel, message, executionId, stepId);
    const status = await waitForApprovalDecision(executionId, stepId, timeoutSeconds);
    return {
      approval: status,
      ok: status === 'approved'
    };
  }
});

async function sendSlackApproval(channel: string, message: string, executionId: string, stepId: string) {
  const value = JSON.stringify({ executionId, stepId });
  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: 'Approval required' }
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve' },
          action_id: 'approve',
          style: 'primary',
          value
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Reject' },
          action_id: 'reject',
          style: 'danger',
          value
        }
      ]
    }
  ];
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      channel,
      text: message,
      blocks
    })
  });
  const body: any = await response.json();
  if (!response.ok || body?.ok === false) {
    fail(body?.error || `slack approval failed with status ${response.status}`, 'provider_error');
  }
}

async function waitForApprovalDecision(executionId: string, stepId: string, timeoutSeconds: number) {
  for (let remaining = timeoutSeconds; remaining > 0; remaining -= 1) {
    const status = await fetchApprovalStatus(executionId, stepId);
    if (status === 'approved' || status === 'rejected') {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return 'timed_out';
}

async function fetchApprovalStatus(executionId: string, stepId: string) {
  const path = `/api/internal/approvals/${encodeURIComponent(executionId)}/${encodeURIComponent(stepId)}`;
  const url = `${stripTrailingSlash(CORE_API_BASE_URL)}${path}`;
  const headers = buildSignedInternalHeaders('GET', path, '', '');
  const response = await fetch(url, {
    method: 'GET',
    headers
  });
  if (!response.ok) {
    return 'pending';
  }
  const body: any = await response.json();
  return typeof body?.status === 'string' ? body.status : 'pending';
}

function buildSignedInternalHeaders(method: string, path: string, queryText: string, body: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signingInput = [timestamp, method, path, queryText, body].join('\n');
  const signature = crypto
    .createHmac('sha256', INTERNAL_AUTH_TOKEN)
    .update(signingInput)
    .digest('base64');
  return {
    'X-Internal-Auth': INTERNAL_AUTH_TOKEN,
    'X-Internal-Timestamp': timestamp,
    'X-Internal-Signature': `sha256=${signature}`
  };
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function normalizeTimeout(value: any) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1800;
  }
  return Math.min(Math.floor(parsed), 7200);
}

function requireString(value: any, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`${field} is required`, 'invalid_request');
  }
  return value.trim();
}

function fail(message: string, code = 'runtime_error'): never {
  const error: any = new Error(message);
  error.code = code;
  throw error;
}
