import { describe, expect, it } from 'vitest';
import { createLiveStructuralLaneRetrieverV1 } from './live-structural-lane-provider.js';

describe('live structural lane provider', () => {
  it('fails closed without an explicit source allowlist', async () => {
    let calls = 0;
    const retriever = createLiveStructuralLaneRetrieverV1({
      workspaceRevision: 'sha256:workspace', candidateEntries: [],
      loadSource: async () => { calls += 1; return { source: '', sourceRevision: '' }; },
      sidecar: { astChunk: async () => { calls += 1; throw new Error('must not call'); } },
    });
    expect(await retriever.retrieve({ query: 'find function', limit: 10, filters: {} })).toEqual([]);
    expect(calls).toBe(0);
  });
});
