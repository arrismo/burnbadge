import type { UsageProvider } from '../lib/provider.js';

export const openaiProvider: UsageProvider = {
  id: 'openai',
  displayName: 'OpenAI',
  async fetchDailyUsage() {
    throw new Error('OpenAI provider not yet implemented');
  },
};

export default openaiProvider;
