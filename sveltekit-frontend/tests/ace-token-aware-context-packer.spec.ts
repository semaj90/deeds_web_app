// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { packAceContext } from '$lib/server/ace/token-aware-context-packer.js';

describe('token-aware ACE context packer', () => {
  it('ranks, dedupes, and compresses sources under budget', () => {
    const packet = packAceContext({
      query: 'encoded_64 rerank and Karpathy GraphRAG cluster summaries',
      maxTokens: 1800,
      clusterSummaries: [
        {
          clusterId: 7,
          summary: 'Cluster 7 synthesizes authority, topology, and retrieval lanes.',
          authorityScore: 0.93,
          clusterPagerank: 0.84,
          karpathyBlend: 1,
          topFiles: ['src/lib/server/ace/context-assembler.ts', 'src/lib/server/ace/token-aware-context-packer.ts'],
        },
      ],
      graphTriples: [
        ['FileA', 'IMPORTS', 'FileB'],
        ['FileA', 'IMPORTS', 'FileB'],
      ],
      chunks: [
        {
          id: 'chunk-a',
          filePath: 'src/lib/server/ace/context-assembler.ts',
          clusterId: 7,
          text: 'const alpha = 1;'.repeat(24),
          qdrantScore: 0.91,
          pagerankScore: 0.73,
          encoded64Score: 0.88,
          graphProximity: 0.42,
        },
        {
          id: 'chunk-a-dup',
          filePath: 'src/lib/server/ace/context-assembler.ts',
          clusterId: 7,
          text: 'duplicate',
          qdrantScore: 0.8,
          pagerankScore: 0.7,
          encoded64Score: 0.7,
        },
        {
          id: 'chunk-empty',
          filePath: 'src/lib/server/ace/token-aware-context-packer.ts',
          clusterId: 9,
          text: ' ',
          qdrantScore: 0.2,
        },
      ],
      wikiRows: [
        { id: 'wiki-1', text: 'Karpathy note for cluster 7.', score: 0.7 },
      ],
      rawCode: [
        { id: 'file-1', text: 'export const x = 1;'.repeat(20), score: 0.4 },
      ],
    });

    expect(packet.activeClusterIds).toContain(7);
    expect(packet.selectedSources.length).toBeGreaterThan(0);
    expect(packet.excludedSources.length).toBeGreaterThan(0);
    expect(packet.tokenBudget.estimatedInputTokens).toBeLessThanOrEqual(1800 - 1024);
    expect(packet.clusterLenses[0]?.authorityScore).toBeCloseTo(0.93, 2);
    expect(packet.clusterLenses[0]?.topFiles).toContain('src/lib/server/ace/context-assembler.ts');
    expect(packet.graphTriples).toHaveLength(1);
    expect(packet.contextMarkdown).toContain('Cluster Lenses');
    expect(packet.contextMarkdown).toContain('Graph Triples');
    expect(packet.contextMarkdown).toContain('Selected Sources');
  });
});
