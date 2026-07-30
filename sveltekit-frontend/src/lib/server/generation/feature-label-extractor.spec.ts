import { describe, expect, it, vi } from 'vitest';

vi.mock('../ai/feature-builder.js', () => ({
  buildFeatureLabels: vi.fn(() => []),
}));

import { extractFeaturesFromContext } from './feature-label-extractor.js';

describe('extractFeaturesFromContext', () => {
  it('normalizes extracted entity labels by entity name', async () => {
    const result = await extractFeaturesFromContext({
      packetKey: 'packet-1',
      sourceRef: 'src/lib/server/ai/feature-extraction.ts',
      featureId: 'feature-extraction-router',
      summary: 'DatabaseClient and LangGraphClient route qdrant queries.',
      symbols: {},
    });

    expect(result.labels).toContain('databaseclient');
    expect(result.labels).toContain('langgraphclient');
    expect(result.labels).not.toContain('[object object]');
  });
});
