import crypto from 'crypto';

export function requireInternalAuthJson(req, res, next, internalAuthToken) {
  if (!internalAuthToken) {
    return res.status(503).json({ ok: false, error: 'internal auth is not configured' });
  }

  const token = req.get('X-Internal-Auth');
  const timestamp = req.get('X-Internal-Timestamp');
  const signature = req.get('X-Internal-Signature');
  if (!token || !timestamp || !signature || !constantTimeEquals(token, internalAuthToken)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum) || Math.abs(Math.floor(Date.now() / 1000) - tsNum) > 300) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const expected = renderInternalSignature(
    internalAuthToken,
    timestamp,
    req.method,
    req.originalUrl || req.url || '/',
    req.rawBody || ''
  );
  if (!constantTimeEquals(expected, signature)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  return next();
}

export function constantTimeEquals(a, b) {
  const aBuf = Buffer.from(String(a), 'utf8');
  const bBuf = Buffer.from(String(b), 'utf8');
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function renderInternalSignature(token, timestamp, method, originalUrl, bodyText) {
  const [path, queryRaw = ''] = String(originalUrl || '/').split('?', 2);
  const query = queryRaw ? `?${queryRaw}` : '';
  const bodyBuf = Buffer.from(bodyText || '', 'utf8');
  const signingInput = Buffer.concat([
    Buffer.from(String(timestamp), 'utf8'),
    Buffer.from('\n', 'utf8'),
    Buffer.from(String(method || 'GET'), 'utf8'),
    Buffer.from('\n', 'utf8'),
    Buffer.from(path || '/', 'utf8'),
    Buffer.from('\n', 'utf8'),
    Buffer.from(query, 'utf8'),
    Buffer.from('\n', 'utf8'),
    bodyBuf
  ]);
  return `sha256=${crypto.createHmac('sha256', token).update(signingInput).digest('base64')}`;
}
