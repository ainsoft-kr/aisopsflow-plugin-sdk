import { startStdioJsonRuntime } from '../shared/runner-runtime.ts';
import { handleDbInvoke } from './query-engine.ts';

startStdioJsonRuntime({
  pluginName: 'db-query',
  version: '0.2.0',
  capabilities: ['db.read', 'db.explain'],
  async handleInvoke({ capability, input }) {
    return handleDbInvoke(capability, input);
  }
});
