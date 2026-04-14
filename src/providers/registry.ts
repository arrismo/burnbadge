import type { ProviderId } from '../lib/types.js';
import type { ProviderRegistry, UsageProvider } from '../lib/provider.js';

import { anthropicProvider } from './anthropic.js';
import { openaiProvider } from './openai.js';
import { openrouterProvider } from './openrouter.js';
import { mockProvider } from './mock.js';

export const defaultProviderRegistry: ProviderRegistry = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  openrouter: openrouterProvider,
  mock: mockProvider,
};

export function getProvider(
  id: ProviderId,
  registry: ProviderRegistry = defaultProviderRegistry,
): UsageProvider {
  const provider = registry[id];
  if (!provider) {
    throw new Error(`Unsupported provider: ${id}`);
  }
  return provider;
}
