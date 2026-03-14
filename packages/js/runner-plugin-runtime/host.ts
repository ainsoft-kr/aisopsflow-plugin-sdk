import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';
import { loadAndValidateManifest } from './manifest.ts';

type HostOptions = {
  manifestPath: string;
  env?: NodeJS.ProcessEnv;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  timer: NodeJS.Timeout;
};

export class RunnerPluginHost {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<string, PendingRequest>();
  private nextId = 1;

  constructor(child: ChildProcessWithoutNullStreams) {
    this.child = child;
    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (!line.trim()) {
        return;
      }
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        this.rejectAll(new Error(`invalid plugin response json: ${String(error)}`));
        return;
      }

      const id = message?.id;
      if (!id || !this.pending.has(id)) {
        return;
      }

      const pending = this.pending.get(id)!;
      clearTimeout(pending.timer);
      this.pending.delete(id);

      if (message.ok) {
        pending.resolve(message.result);
      } else {
        pending.reject(new Error(String(message?.error?.message || 'plugin request failed')));
      }
    });

    child.on('exit', (code, signal) => {
      this.rejectAll(new Error(`plugin process exited code=${String(code)} signal=${String(signal)}`));
    });
  }

  async probe(timeoutMs = 1000): Promise<unknown> {
    return this.request({ type: 'probe' }, timeoutMs);
  }

  async invoke(capability: string, input: unknown, timeoutMs = 5000): Promise<unknown> {
    return this.request({ type: 'invoke', capability, input }, timeoutMs);
  }

  async close(): Promise<void> {
    this.child.kill();
  }

  private request(payload: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const id = `req-${this.nextId++}`;
    const body = JSON.stringify({ id, ...payload });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`plugin request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${body}\n`);
    });
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

export async function startRunnerPluginHost({ manifestPath, env = {} }: HostOptions): Promise<RunnerPluginHost> {
  const manifest = await loadAndValidateManifest(manifestPath);
  if (manifest.runtime?.type !== 'node') {
    throw new Error(`unsupported runtime.type for host: ${manifest.runtime?.type}`);
  }
  if (manifest.runtime?.protocol !== 'stdio-json') {
    throw new Error(`unsupported runtime.protocol for host: ${manifest.runtime?.protocol}`);
  }

  const manifestDir = path.dirname(manifestPath);
  const entrypoint = path.resolve(manifestDir, manifest.runtime.entrypoint!);
  const cwd = manifest.runtime.working_dir
    ? path.resolve(manifestDir, manifest.runtime.working_dir)
    : manifestDir;

  const child = spawn(process.execPath, ['--experimental-strip-types', entrypoint], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let stderrBuffer = '';
  child.stderr.on('data', (chunk) => {
    stderrBuffer += String(chunk);
  });

  const host = new RunnerPluginHost(child);
  try {
    await host.probe((manifest.execution?.startup_timeout_seconds ?? 5) * 1000);
    return host;
  } catch (error) {
    child.kill();
    throw new Error(`${String(error)} stderr=${stderrBuffer.trim()}`);
  }
}
