import assert from 'node:assert/strict';

import { signedInternalHeaders } from '../../packages/js/internal-auth/internal-auth.ts';
import { startChannelFixtureServer } from './fixtures/channel-fixture.mjs';

function parseArgs(argv) {
  const parsed = new Map();
  for (let idx = 0; idx < argv.length; idx += 1) {
    const current = argv[idx];
    if (!current.startsWith('--')) {
      continue;
    }
    const [rawKey, inlineValue] = current.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      parsed.set(rawKey, inlineValue);
      continue;
    }
    const next = argv[idx + 1];
    if (next && !next.startsWith('--')) {
      parsed.set(rawKey, next);
      idx += 1;
    } else {
      parsed.set(rawKey, 'true');
    }
  }
  return parsed;
}

async function requestJson(baseUrl, path, { method = 'POST', token, body, timeoutMs = 1000, headers = {} } = {}) {
  const bodyText = body === undefined ? '' : JSON.stringify(body);
  const signedHeaders =
    token
      ? signedInternalHeaders(token, method, path, bodyText)
      : { 'Content-Type': 'application/json' };
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...signedHeaders, ...headers },
    body: body === undefined ? undefined : bodyText,
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (_err) {
    json = null;
  }
  return { status: response.status, text, json };
}

async function requestRaw(baseUrl, path, { method = 'POST', token, bodyText = '', timeoutMs = 1000, headers = {} } = {}) {
  const signedHeaders =
    token
      ? signedInternalHeaders(token, method, path, bodyText)
      : { 'Content-Type': 'application/json' };
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...signedHeaders, ...headers },
    body: bodyText,
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (_err) {
    json = null;
  }
  return { status: response.status, text, json };
}

async function expectTimeout(baseUrl, path, { token, body, timeoutMs }) {
  try {
    await requestJson(baseUrl, path, { token, body, timeoutMs });
    throw new Error('expected timeout');
  } catch (err) {
    assert.ok(
      err?.name === 'TimeoutError' || err?.name === 'AbortError' || /timeout/i.test(String(err)),
      `expected timeout error, got ${err}`
    );
  }
}

async function runChannelSuite({ baseUrl, token }) {
  const results = [];

  const probe = await requestRaw(baseUrl, '/probe', { bodyText: '{}', headers: { 'Content-Type': 'application/json' } });
  assert.equal(probe.status, 200, 'probe must return 200');
  assert.equal(probe.json?.ok, true, 'probe must return JSON ok=true');
  results.push('probe');

  const sendSuccess = await requestJson(baseUrl, '/send', {
    token,
    body: { target: '#ops', text: 'deployment failed' }
  });
  assert.equal(sendSuccess.status, 200, 'send success must return 200');
  assert.equal(sendSuccess.json?.ok, true, 'send success must return ok=true');
  results.push('send');

  const unauthorized = await requestJson(baseUrl, '/send', {
    body: { target: '#ops', text: 'unauthorized test' }
  });
  assert.equal(unauthorized.status, 401, 'missing internal auth must return 401');
  assert.equal(unauthorized.json?.ok, false, 'unauthorized response must return ok=false');
  results.push('internal-auth');

  const malformed = await requestRaw(baseUrl, '/send', {
    token,
    bodyText: '{"target":',
    headers: { 'Content-Type': 'application/json' }
  });
  assert.equal(malformed.status, 400, 'malformed JSON must return 400');
  assert.equal(malformed.json?.ok, false, 'malformed response must return ok=false');
  results.push('malformed-json');

  const invalidBody = await requestJson(baseUrl, '/send', {
    token,
    body: { text: 'missing target' }
  });
  assert.equal(invalidBody.status, 400, 'invalid send body must return 400');
  assert.equal(invalidBody.json?.ok, false, 'invalid send body must return ok=false');
  results.push('invalid-payload');

  await expectTimeout(baseUrl, '/send?delay_ms=250', {
    token,
    body: { target: '#ops', text: 'slow request' },
    timeoutMs: 50
  });
  results.push('timeout');

  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = args.get('token') || 'conformance-token';
  const selfTest = args.get('self-test') !== 'false';
  const baseUrl = args.get('url');

  if (baseUrl) {
    const results = await runChannelSuite({ baseUrl, token });
    console.log(`conformance passed: ${results.join(', ')}`);
    return;
  }

  if (!selfTest) {
    throw new Error('either --url or --self-test must be provided');
  }

  const configuredFixture = await startChannelFixtureServer({ internalAuthToken: token });
  try {
    const results = await runChannelSuite({ baseUrl: configuredFixture.baseUrl, token });
    const unconfiguredFixture = await startChannelFixtureServer({ internalAuthToken: '' });
    try {
      const misconfigured = await requestJson(unconfiguredFixture.baseUrl, '/send', {
        token,
        body: { target: '#ops', text: 'misconfigured auth' }
      });
      assert.equal(misconfigured.status, 503, 'missing internal auth configuration must return 503');
      assert.equal(misconfigured.json?.ok, false, 'misconfigured auth response must return ok=false');
      results.push('misconfigured-auth');
    } finally {
      await unconfiguredFixture.close();
    }
    console.log(`conformance passed: ${results.join(', ')}`);
  } finally {
    await configuredFixture.close();
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
