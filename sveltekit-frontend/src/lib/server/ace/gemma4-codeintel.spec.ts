import { describe, expect, it } from 'vitest';
import { buildGemma4AcePrompt } from './gemma4-codeintel.js';
import type { AceCodeIntelContext } from './codeintel-datastore.js';

describe('buildGemma4AcePrompt', () => {
  it('includes packet and tree-node identity in source context', () => {
    const context: AceCodeIntelContext = {
      query: 'find the packet',
      repoId: 'default',
      clusterContext: [],
      chunkContext: [
        {
          chunkId: 'chunk-1',
          relativePath: 'src/lib/server/foo.ts',
          packetKey: 'packet-123',
          treeNodeId: 'tree-123',
          featureId: 'feature.alpha',
          featureLabel: 'Feature Alpha',
          contentHash: 'sha256:abc123',
          workspaceRevision: 'rev-1',
          kind: 'module',
          domain: 'server',
          language: 'typescript',
          extension: 'ts',
          semanticTags: ['feature:alpha'],
          summary: 'summary',
          gpuCluster: 1,
          somCluster: 2,
          somBmuRow: 3,
          somBmuCol: 4,
        },
      ],
      researchContext: [],
      health: { ok: true, chunkCount: 1, clusterCount: 0, embeddingCoverage: 1 },
      degraded: false,
      errors: [],
    };

    const prompt = buildGemma4AcePrompt(context);

    expect(prompt).toContain('Identity: packet=packet-123');
    expect(prompt).toContain('feature=feature.alpha');
    expect(prompt).toContain('tree=tree-123');
    expect(prompt).toContain('src/lib/server/foo.ts');
  });
});
