// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { packAceContext } from '$lib/server/ace/token-aware-context-packer.js';
import { packContext } from '$lib/server/ace/token-aware-packer.js';
import { assembleContext } from '$lib/server/ai/hermes-synth.js';

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

  it('normalizes aliased retrieval lanes in the canonical packer', () => {
    const packet = packContext({
      query: 'alias normalization',
      budget: {
        maxInputTokens: 1800,
        reservedOutputTokens: 1024,
      },
      chunks: [
        {
          id: 'chunk-1',
          text: 'chunk text '.repeat(20),
          filePath: 'src/lib/server/ace/context-assembler.ts',
          clusterId: 3,
          qdrantScore: 0.9,
          encoded64Score: 0.8,
          pagerankScore: 0.7,
          graphProximity: 0.4,
        },
      ],
      wikiRows: [
        { id: 'wiki-1', text: 'wiki note', score: 0.6, clusterId: 5 },
      ],
      rawCode: [
        { id: 'code-1', text: 'export const x = 1;', score: 0.5 },
      ],
      grpoCheckpoints: [
        { hyperedgeHash: 'h1', gradeScore: 0.77 },
      ],
      clusterSummaries: [
        { clusterId: 3, summary: 'cluster summary', authorityScore: 0.9, clusterPagerank: 0.8 },
      ],
    });

    expect(packet.activeClusterIds).toEqual(expect.arrayContaining([3, 5]));
    expect(packet.context.directEvidence.map((entry) => entry.id)).toContain('src/lib/server/ace/context-assembler.ts');
    expect(packet.context.priorCaseSummaries.map((entry) => entry.id)).toContain('wiki-1');
    expect(packet.context.priorCaseSummaries.map((entry) => entry.id)).toContain('h1');
    expect(packet.context.clusterSummaries[0]?.clusterId).toBe(3);
    expect(packet.telemetry.selectedSourceIds.length).toBeGreaterThan(0);
  });

  it('assembles a packed Hermes context when budget opts are set', () => {
    const execution = {
      results: [
        {
          tool: 'qdrant_search_codebase',
          ok: true,
          data: [
            {
              filePath: 'src/lib/server/ace/context-assembler.ts',
              content: 'hello world '.repeat(24),
              score: 0.9,
              clusterId: 4,
              encoded64Score: 0.8,
              pagerankScore: 0.7,
              graphProximity: 0.4,
            },
          ],
          durationMs: 4,
        },
        {
          tool: 'clusters_get_summary_lenses',
          ok: true,
          data: {
            summaries: [
              {
                clusterId: 4,
                label: 'ACE cluster',
                summary: 'Cluster summary',
                authorityScore: 0.88,
                clusterPagerank: 0.77,
              },
            ],
          },
          durationMs: 4,
        },
        {
          tool: 'neo4j_expand_neighborhood',
          ok: true,
          data: { triples: [['A', 'REL', 'B']] },
          durationMs: 4,
        },
        {
          tool: 'couchdb_view_query',
          ok: true,
          data: { view: 'docs/by-cluster', rows: [{ key: ['cluster:4'], value: 1 }] },
          durationMs: 4,
        },
      ],
      totalDurationMs: 16,
      toolsExecuted: 4,
      toolsFailed: 0,
      skillResults: [],
    };

    const context = assembleContext('budgeted query', execution as never, {
      maxInputTokens: 1800,
      reservedOutputTokens: 1200,
    });

    expect(context).toContain('# Retrieval context for: budgeted query');
    expect(context).toContain('## Cluster summaries');
    expect(context).toContain('## Graph relationships');
    expect(context).toContain('## Knowledge index groups');
    expect(context).toContain('## Relevant code / evidence chunks');
  });
});
