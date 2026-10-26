import { describe, expect, it } from 'vitest';
import { parseAndIndexChunkBatchSimd } from './simdjson-codebase-indexer-v1.js';

describe('SIMDJSON High-Throughput Codebase Indexer (v1)', () => {
  it('parses JSON text and constructs valid Manifold4 nodes with feature labels', () => {
    const fixtureData = [
      {
        id: 'chunk_chat_01',
        source_ref: 'src/routes/(app)/chat/+page.svelte',
        manifold4: [12.0, 14.5, 0.12, 0.92],
        grade_score: 0.92,
      },
      {
        id: 'chunk_auth_01',
        source_ref: 'src/lib/server/auth/auth-guard.ts',
        som_bmu_row: 2.0,
        som_bmu_col: 3.0,
        centroid_distance: 0.05,
        grade_score: 0.88,
      },
      {
        id: 'chunk_low_grade',
        source_ref: 'src/lib/legacy/old-util.ts',
        manifold4: [1.0, 1.0, 0.9, 0.1],
        grade_score: 0.1, // Below default 0.35 threshold
      },
      {
        id: 'chunk_canvas_01',
        source_ref: 'src/routes/(app)/canvas/+page.svelte',
        grade_score: 0.75,
      },
    ];

    const jsonString = JSON.stringify(fixtureData);
    const result = parseAndIndexChunkBatchSimd(jsonString);

    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
    expect(result.processedCount).toBe(4);
    // 3 valid nodes admitted (chunk_low_grade filtered out)
    expect(result.validNodeCount).toBe(3);
    expect(result.nodes).toHaveLength(3);

    // Verify node 0 (chat)
    expect(result.nodes[0].id).toBe('chunk_chat_01');
    expect(result.nodes[0].featureLabel).toBe('chat');
    expect(result.nodes[0].coords).toEqual([12.0, 14.5, 0.12, 0.92]);

    // Verify node 1 (auth)
    expect(result.nodes[1].id).toBe('chunk_auth_01');
    expect(result.nodes[1].featureLabel).toBe('auth');
    expect(result.nodes[1].coords).toEqual([2.0, 3.0, 0.05, 0.88]);

    // Verify feature distribution count
    expect(result.featureDistribution.chat).toBe(1);
    expect(result.featureDistribution.auth).toBe(1);
    expect(result.featureDistribution.canvas).toBe(1);
  });

  it('tolerates malformed records gracefully and adheres to timing metrics', () => {
    const rawWithBadRecords = [
      { id: 'valid_1', source_ref: 'src/lib/chat/Chat.svelte', grade_score: 0.8 },
      { non_id: 'bad', missing_source: true },
      { id: 'valid_2', source_ref: 'src/routes/login/+page.svelte', grade_score: 0.7 },
    ];

    const result = parseAndIndexChunkBatchSimd(JSON.stringify(rawWithBadRecords));
    expect(result.processedCount).toBe(3);
    expect(result.validNodeCount).toBe(2);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
