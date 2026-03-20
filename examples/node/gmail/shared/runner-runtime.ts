import readline from 'readline';

export function startStdioJsonRuntime({ pluginName, version, capabilities, handleInvoke, handleProbe }) {
  if (typeof handleInvoke !== 'function') {
    throw new Error('handleInvoke is required');
  }

  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });

  rl.on('line', async (line) => {
    if (!line || !line.trim()) {
      return;
    }

    let message;
    try {
      message = JSON.parse(line);
    } catch (_error) {
      writeResponse({
        id: null,
        ok: false,
        error: { code: 'invalid_json', message: 'request must be valid JSON' }
      });
      return;
    }

    const id = message?.id ?? null;
    try {
      if (message?.type === 'probe') {
        const result = handleProbe
          ? await handleProbe(message)
          : { name: pluginName, version, capabilities };
        writeResponse({ id, ok: true, result });
        return;
      }

      if (message?.type === 'invoke') {
        const result = await handleInvoke({
          capability: message?.capability,
          input: message?.input,
          request: message
        });
        writeResponse({ id, ok: true, result });
        return;
      }

      writeResponse({
        id,
        ok: false,
        error: { code: 'invalid_type', message: 'type must be probe or invoke' }
      });
    } catch (error) {
      writeResponse({
        id,
        ok: false,
        error: {
          code: normalizeErrorCode(error),
          message: String(error?.message || error)
        }
      });
    }
  });
}

function writeResponse(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function normalizeErrorCode(error) {
  if (typeof error?.code === 'string' && error.code.trim()) {
    return error.code;
  }
  return 'runtime_error';
}
