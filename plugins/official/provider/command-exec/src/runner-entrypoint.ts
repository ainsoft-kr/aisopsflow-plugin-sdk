import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { startStdioJsonRuntime } from '../../../../../packages/js/runner-plugin-runtime/index.ts';

const execAsync = promisify(exec);

startStdioJsonRuntime({
  pluginName: 'command-exec',
  version: '0.1.0',
  capabilities: ['shell.exec'],
  async handleInvoke({ capability, input }) {
    if (capability !== 'shell.exec') {
      fail(`unsupported capability: ${capability}`, 'unsupported_capability');
    }
    const command = requireString(input?.command, 'command');
    const cwd = typeof input?.cwd === 'string' && input.cwd.trim() ? input.cwd.trim() : undefined;
    const timeoutSeconds = normalizeTimeout(input?.timeout_seconds);
    const env = normalizeEnv(input?.env);
    try {
      const result = await execAsync(command, {
        cwd,
        env: { ...process.env, ...env },
        timeout: timeoutSeconds * 1000,
        shell: '/bin/sh',
        maxBuffer: 10 * 1024 * 1024
      });
      return {
        exit_code: 0,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? ''
      };
    } catch (error: any) {
      return {
        exit_code: Number.isFinite(error?.code) ? error.code : 1,
        stdout: error?.stdout ?? '',
        stderr: error?.stderr ?? String(error?.message || error)
      };
    }
  }
});

function normalizeEnv(value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => typeof key === 'string' && key.trim())
      .map(([key, entryValue]) => [key.trim(), String(entryValue ?? '')])
  );
}

function normalizeTimeout(value: any) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60;
  }
  return Math.min(Math.floor(parsed), 3600);
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
