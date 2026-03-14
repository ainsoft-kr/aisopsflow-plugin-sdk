import fs from 'node:fs/promises';
import path from 'node:path';

type ManifestEnvVar = {
  name: string;
  secret: boolean;
  description?: string;
  default?: string;
};

type RunnerPluginManifest = {
  api_version?: string;
  kind?: string;
  metadata?: {
    name?: string;
    display_name?: string;
    plugin_version?: string;
    publisher?: string;
  };
  runtime?: {
    type?: string;
    entrypoint?: string;
    working_dir?: string;
    protocol?: string;
  };
  install?: {
    layout?: string;
    root?: string;
  };
  capabilities?: {
    provides?: string[];
  };
  execution?: {
    startup_timeout_seconds?: number;
    request_timeout_seconds?: number;
    idle_ttl_seconds?: number;
    max_concurrency?: number;
    restart_policy?: string;
  };
  env?: {
    required?: ManifestEnvVar[];
    optional?: ManifestEnvVar[];
  };
  permissions?: unknown;
  security?: unknown;
  compatibility?: unknown;
  observability?: unknown;
};

export class ManifestValidationError extends Error {
  issues: string[];

  constructor(issues: string[]) {
    super(`invalid runner plugin manifest: ${issues.join('; ')}`);
    this.name = 'ManifestValidationError';
    this.issues = issues;
  }
}

export async function loadAndValidateManifest(manifestPath: string): Promise<RunnerPluginManifest> {
  const raw = await fs.readFile(manifestPath, 'utf8');
  const manifest = parseSimpleYaml(raw) as RunnerPluginManifest;
  validateManifest(manifest, manifestPath);
  return manifest;
}

export function validateManifest(manifest: RunnerPluginManifest, manifestPath = '<memory>'): void {
  const issues: string[] = [];

  if (manifest.api_version !== 'runner-plugin/v1') {
    issues.push('api_version must be runner-plugin/v1');
  }
  if (manifest.kind !== 'RunnerPlugin') {
    issues.push('kind must be RunnerPlugin');
  }
  if (!manifest.metadata?.name) {
    issues.push('metadata.name is required');
  }
  if (!manifest.runtime?.type) {
    issues.push('runtime.type is required');
  }
  if (!manifest.runtime?.entrypoint) {
    issues.push('runtime.entrypoint is required');
  }
  if (!manifest.runtime?.protocol) {
    issues.push('runtime.protocol is required');
  }
  if (!Array.isArray(manifest.capabilities?.provides) || manifest.capabilities.provides.length === 0) {
    issues.push('capabilities.provides must contain at least one capability');
  }

  const allowedRuntimeTypes = new Set(['node', 'python', 'binary']);
  if (manifest.runtime?.type && !allowedRuntimeTypes.has(manifest.runtime.type)) {
    issues.push(`unsupported runtime.type: ${manifest.runtime.type}`);
  }

  const allowedProtocols = new Set(['stdio-json', 'local-http']);
  if (manifest.runtime?.protocol && !allowedProtocols.has(manifest.runtime.protocol)) {
    issues.push(`unsupported runtime.protocol: ${manifest.runtime.protocol}`);
  }

  if (typeof manifest.execution?.startup_timeout_seconds === 'number' && manifest.execution.startup_timeout_seconds <= 0) {
    issues.push('execution.startup_timeout_seconds must be > 0');
  }
  if (typeof manifest.execution?.request_timeout_seconds === 'number' && manifest.execution.request_timeout_seconds <= 0) {
    issues.push('execution.request_timeout_seconds must be > 0');
  }
  if (typeof manifest.execution?.max_concurrency === 'number' && manifest.execution.max_concurrency <= 0) {
    issues.push('execution.max_concurrency must be > 0');
  }

  const envNames = new Set<string>();
  for (const entry of [...(manifest.env?.required || []), ...(manifest.env?.optional || [])]) {
    if (!entry?.name) {
      issues.push('env entries must have a name');
      continue;
    }
    if (envNames.has(entry.name)) {
      issues.push(`duplicate env entry: ${entry.name}`);
    }
    envNames.add(entry.name);
  }

  if (manifest.runtime?.entrypoint) {
    const manifestDir = path.dirname(manifestPath);
    const resolvedEntrypoint = path.resolve(manifestDir, manifest.runtime.entrypoint);
    if (!resolvedEntrypoint.startsWith(path.resolve(manifestDir))) {
      issues.push('runtime.entrypoint must stay under the manifest directory');
    }
  }

  if (issues.length > 0) {
    throw new ManifestValidationError(issues);
  }
}

function parseSimpleYaml(raw: string): unknown {
  const lines = raw
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'));

  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; key: string | null; value: any }> = [{ indent: -1, key: null, value: root }];

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const indent = line.match(/^ */)?.[0].length ?? 0;
    const trimmed = line.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].value;
    if (trimmed.startsWith('- ')) {
      const itemText = trimmed.slice(2);
      if (!Array.isArray(parent)) {
        throw new Error(`unsupported yaml structure near: ${line}`);
      }
      if (itemText.includes(':')) {
        const obj: Record<string, unknown> = {};
        parent.push(obj);
        const [k, ...rest] = itemText.split(':');
        obj[k.trim()] = coerce(rest.join(':').trim());
        stack.push({ indent, key: null, value: obj });
      } else {
        parent.push(coerce(itemText));
      }
      continue;
    }

    const [rawKey, ...rest] = trimmed.split(':');
    const key = rawKey.trim();
    const valueText = rest.join(':').trim();
    const nextLine = lines[idx + 1];
    const nextTrimmed = nextLine?.trim() ?? '';
    const nextIndent = nextLine?.match(/^ */)?.[0].length ?? -1;

    if (valueText === '') {
      const container =
        nextIndent > indent && nextTrimmed.startsWith('- ')
          ? []
          : {};
      parent[key] = container;
      stack.push({ indent, key, value: container });
    } else {
      parent[key] = coerce(valueText);
    }
  }

  return root;
}

function coerce(value: string): unknown {
  if (value === '[]') return [];
  if (value === '{}') return {};
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value.replace(/^['"]|['"]$/g, '');
}
