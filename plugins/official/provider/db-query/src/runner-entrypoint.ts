import { startStdioJsonRuntime } from '../../../../../packages/js/runner-plugin-runtime/index.ts';
import { handleDbInvoke } from './query-engine.ts';

startStdioJsonRuntime({
  pluginName: 'db-query',
  version: '0.2.0',
  capabilities: ['db.query', 'db.read', 'db.explain'],
  async handleInvoke({ capability, input }) {
    return handleDbInvoke(capability, input);
  }
});
