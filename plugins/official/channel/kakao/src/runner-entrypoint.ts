import { startStdioJsonRuntime } from '../../../../../packages/js/runner-plugin-runtime/index.ts';
import { handleKakaoInvoke } from './provider-engine.ts';

startStdioJsonRuntime({
  pluginName: 'kakao-provider',
  version: '0.2.0',
  capabilities: ['kakao.alimtalk.send'],
  async handleInvoke({ capability, input }) {
    return handleKakaoInvoke(capability, input);
  }
});
