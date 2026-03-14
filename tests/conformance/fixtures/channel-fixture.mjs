import http from 'node:http';
import { URL } from 'node:url';

import { constantTimeEquals, renderInternalSignature } from '../../../packages/js/internal-auth/internal-auth.ts';

function json(res, statusCode, payload) {
  const bodyText = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(bodyText)
  });
  res.end(bodyText);
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let bodyText = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      bodyText += chunk;
    });
    req.on('end', () => resolve(bodyText));
    req.on('error', reject);
  });
}

function verifyInternalAuth(token, req, bodyText) {
  if (!token) {
    return { ok: false, status: 503, error: 'internal auth is not configured' };
  }

  const presentedToken = req.headers['x-internal-auth'];
  const timestamp = req.headers['x-internal-timestamp'];
  const signature = req.headers['x-internal-signature'];
  if (
    typeof presentedToken !== 'string'
      || typeof timestamp !== 'string'
      || typeof signature !== 'string'
      || !constantTimeEquals(presentedToken, token)
  ) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum) || Math.abs(Math.floor(Date.now() / 1000) - tsNum) > 300) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }

  const expectedSignature = renderInternalSignature(token, timestamp, req.method || 'GET', req.url || '/', bodyText);
  if (!constantTimeEquals(expectedSignature, signature)) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }

  return { ok: true };
}

export async function startChannelFixtureServer({
  internalAuthToken = 'conformance-token',
  port = 0
} = {}) {
  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');

    if (req.method === 'POST' && requestUrl.pathname === '/probe') {
      json(res, 200, { ok: true, name: 'channel-fixture', version: '0.1.0', capabilities: ['send.channel'] });
      return;
    }

    if (req.method === 'POST' && requestUrl.pathname === '/send') {
      const bodyText = await collectBody(req);
      const auth = verifyInternalAuth(internalAuthToken, req, bodyText);
      if (!auth.ok) {
        json(res, auth.status, { ok: false, error: auth.error });
        return;
      }

      const delayMs = Number(requestUrl.searchParams.get('delay_ms') || '0');
      if (Number.isFinite(delayMs) && delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      let payload;
      try {
        payload = bodyText ? JSON.parse(bodyText) : {};
      } catch (_err) {
        json(res, 400, { ok: false, error: 'invalid json' });
        return;
      }

      if (typeof payload.target !== 'string' || typeof payload.text !== 'string') {
        json(res, 400, { ok: false, error: 'target and text must be strings' });
        return;
      }

      if (!payload.target.trim() || !payload.text.trim()) {
        json(res, 400, { ok: false, error: 'target and text required' });
        return;
      }

      json(res, 200, { ok: true, status: 202, body: 'accepted' });
      return;
    }

    json(res, 404, { ok: false, error: 'not found' });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to bind conformance fixture');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    })
  };
}
