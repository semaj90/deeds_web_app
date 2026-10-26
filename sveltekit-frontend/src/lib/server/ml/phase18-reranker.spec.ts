import { describe, expect, test } from 'vitest';
import { getRerankerStatus, predictRerankerScore, rerankerBatch, type Phase18RerankerInput } from './phase18-reranker.js';

const makeInput = (
  packetKey: string,
  validationStatus: Phase18RerankerInput['validationStatus'],
): Phase18RerankerInput => ({
  packetKey,
  sourceRef: `src/${packetKey}.ts`,
  featureId: 'test.feature',
  validationStatus,
  features: {
    qdrant_score: 0.9,
    cluster_score: 0.8,
    topological_score: 0.7,
    fusion_score: 0.85,
    metadata: {
      authority_score: 0.99,
      member_count: 1,
      summary_length: 10,
      source_ref_depth: 1,
      is_core_library: false,
      is_test_file: false,
      has_packets: true,
      packet_count: 1,
      avg_packet_authority: 0.9,
    },
  },
});

describe('Phase 18 reranker unavailable boundary', () => {
  test('status does not claim active training or an authority-score fallback', () => {
    const status = getRerankerStatus();
    expect(status.isReady).toBe(false);
    expect(status.modelLoaded).toBe(false);
    expect(status.fallbackActive).toBe(false);
    expect(status.message).not.toContain('training in progress');
    expect(status.message).toContain('No learned score');
  });
  test.each(['pending', 'invalid'] as const)('blocks %s Phase 17 input', async (validationStatus) => {
    const result = await predictRerankerScore(makeInput('candidate', validationStatus));

    expect(result.status).toBe('BLOCKED_INPUT');
    expect(result.rerankScore).toBeNull();
    expect(result.confidence).toBeNull();
  });

  test('does not present an authority heuristic as a trained model score', async () => {
    const result = await predictRerankerScore(makeInput('candidate', 'valid'));

    expect(result.status).toBe('MODEL_UNAVAILABLE');
    expect(result.rerankScore).toBeNull();
    expect(result.confidence).toBeNull();
  });

  test('preserves input order when no model scores are available', async () => {
    const results = await rerankerBatch([
      makeInput('lower-authority', 'valid'),
      makeInput('higher-authority', 'valid'),
    ]);

    expect(results.map((result) => result.packetKey)).toEqual([
      'lower-authority',
      'higher-authority',
    ]);
    expect(results.every((result) => result.rerankScore === null)).toBe(true);
  });
});
