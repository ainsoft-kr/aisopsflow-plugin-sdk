import fetch from 'node-fetch';

const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

export async function handleKakaoInvoke(capability: string, input: any) {
  if (capability !== 'kakao.alimtalk.send') fail(`unsupported capability: ${capability}`, 'unsupported_capability');

  const tenantId = requireString(input?.tenant_id, 'tenant_id');
  const providerId = requireString(input?.provider_id, 'provider_id');
  const templateId = requireString(input?.template_id, 'template_id');
  const traceId = optionalString(input?.trace_id);
  const recipients = normalizeRecipients(input?.to);
  const vars = normalizeObject(input?.vars, 'vars');

  const provider = resolveProvider(providerId);
  const template = resolveTemplate(provider, templateId);
  const accessToken = await resolveAccessToken(providerId, provider);
  const deliveries = [];

  for (const phoneNumber of recipients) {
    const body = {
      cid: traceId || `aisopsflow-${Date.now()}`,
      message_type: 'AT',
      phone_number: phoneNumber,
      sender_key: template.sender_key || provider.sender_key,
      template_code: template.template_code,
      message: renderTemplate(template.message, vars),
      ...(template.sender_no || provider.sender_no ? { sender_no: template.sender_no || provider.sender_no } : {}),
      ...(template.title ? { title: renderTemplate(template.title, vars) } : {}),
      ...(Array.isArray(template.buttons) && template.buttons.length > 0 ? { buttons: template.buttons } : {})
    };

    const response = await fetch(buildBaseUrl(provider.base_url) + '/v2/send/kakao', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const raw = await response.text();
    const parsed = tryParseJson(raw) ?? { raw };
    if (!response.ok) {
      fail(`kakao provider returned status ${response.status}`, 'provider_error', parsed);
    }
    deliveries.push({
      phone_number: phoneNumber,
      status: response.status,
      response: parsed
    });
  }

  return {
    ok: true,
    tenant_id: tenantId,
    provider_id: providerId,
    template_id: templateId,
    result: {
      accepted: deliveries.length,
      failed: 0
    },
    deliveries
  };
}

function resolveProvider(providerId: string): any {
  const providers = parseJsonEnv('KAKAO_BIZ_PROVIDERS_JSON');
  const provider = providers?.[providerId];
  if (!provider || typeof provider !== 'object') fail(`provider is not configured: ${providerId}`, 'invalid_request');
  if (typeof provider.base_url !== 'string' || !provider.base_url.trim()) fail(`provider base_url is missing: ${providerId}`, 'invalid_request');
  return provider;
}

function resolveTemplate(provider: any, templateId: string): any {
  const template = provider?.templates?.[templateId];
  if (!template || typeof template !== 'object') fail(`template is not configured: ${templateId}`, 'invalid_request');
  if (typeof template.template_code !== 'string' || !template.template_code.trim()) fail(`template_code is missing: ${templateId}`, 'invalid_request');
  if (typeof template.message !== 'string' || !template.message.trim()) fail(`message is missing: ${templateId}`, 'invalid_request');
  return template;
}

async function resolveAccessToken(providerId: string, provider: any) {
  const now = Date.now();
  const cached = tokenCache.get(providerId);
  if (cached && cached.expiresAt > now + 30000) return cached.accessToken;

  if (typeof provider.access_token === 'string' && provider.access_token.trim()) {
    return provider.access_token.trim();
  }

  const clientId = requireString(provider.client_id, 'client_id');
  const clientSecret = requireString(provider.client_secret, 'client_secret');
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(buildBaseUrl(provider.base_url) + '/v2/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString()
  });
  const raw = await response.text();
  const parsed = tryParseJson(raw);
  if (!response.ok || !parsed?.access_token) {
    fail(`failed to obtain kakao oauth token for provider ${providerId}`, 'provider_error', parsed ?? { raw });
  }

  const expiresIn = Number(parsed.expires_in || 3600);
  tokenCache.set(providerId, {
    accessToken: parsed.access_token,
    expiresAt: now + Math.max(60, expiresIn) * 1000
  });
  return parsed.access_token;
}

function renderTemplate(template: string, vars: Record<string, any>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function parseJsonEnv(name: string) {
  try {
    return JSON.parse(process.env[name] || '{}');
  } catch (_error) {
    fail(`${name} must be valid JSON`, 'invalid_request');
  }
}

function buildBaseUrl(raw: string) {
  return raw.replace(/\/+$/, '');
}

function normalizeRecipients(value: any) {
  if (!Array.isArray(value) || value.length === 0) fail('to is required', 'invalid_request');
  const recipients = value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
  if (recipients.length === 0) fail('to must contain at least one recipient', 'invalid_request');
  return recipients;
}

function normalizeObject(value: any, field: string) {
  if (value === undefined || value === null) return {};
  if (Array.isArray(value) || typeof value !== 'object') fail(`${field} must be an object when provided`, 'invalid_request');
  return value;
}

function requireString(value: any, field: string) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} is required`, 'invalid_request');
  return value.trim();
}

function optionalString(value: any) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function tryParseJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function fail(message: string, code = 'runtime_error', details?: any): never {
  const error: any = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}
