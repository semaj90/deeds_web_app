import { describe, expect, it } from 'vitest';

import { buildClassificationObservationV1 } from './classification-observation-v1.js';
import { truncateAndRenormalizeMrl, scorePrototypeLabelsMrl } from './embeddinggemma-mrl-classifier-v1.js';
import { classifyStructuralCodeRoleV1 } from './structural-code-role-classifier-v1.js';
import { compileClassificationCandidateFeaturesV1 } from './classification-candidate-feature-compiler-v1.js';
import { classificationObservationsToHmmV1 } from './classification-hmm-bridge-v1.js';

function unitVector(index: number): number[] {
  const vector = new Array<number>(768).fill(0);
  vector[index] = 1;
  return vector;
}

describe('Parent Atlas classification control-plane contracts', () => {
  it('derives normalized MRL prefixes without changing canonical 768 input', () => {
    const input = unitVector(0);
    const derived = truncateAndRenormalizeMrl(input, 128);
    expect(derived).toHaveLength(128);
    expect(Math.sqrt(derived.reduce((sum, value) => sum + value * value, 0))).toBeCloseTo(1, 8);
    expect(input).toHaveLength(768);
  });

  it('scores prototype labels in one EmbeddingGemma lineage', () => {
    const scores = scorePrototypeLabelsMrl(unitVector(0), [
      { label: 'bug_fix', vector: unitVector(0) },
      { label: 'explanation', vector: unitVector(1) },
    ], 128);
    expect(scores[0].label).toBe('bug_fix');
    expect(scores[0].probability).toBeGreaterThan(scores[1].probability);
  });

  it('classifies Qdrant upsert code as projection evidence, not canonical authority', () => {
    const observation = classifyStructuralCodeRoleV1({
      sourceRef: 'src/lib/server/workers/qdrant-sync-worker.ts',
      workspaceRevision: 'w1',
      sourceRevision: 's1',
      calls: ['qdrant.upsert'],
      evidenceRefs: ['ast:1'],
    });
    expect(observation.labels[0].label).toBe('PROJECTION_WRITER');
    expect(observation.canonicalWritesAllowed).toBe(false);
    expect(observation.retrievalVoteAdded).toBe(false);
  });

  it('compiles detailed classifier receipts into existing bounded feature columns', () => {
    const domain = buildClassificationObservationV1({
      requestId: 'r1', workspaceRevision: 'w1', task: 'domain',
      labels: [{ label: 'embedding', probability: 0.9 }, { label: 'graph', probability: 0.1 }],
      modelId: 'm', modelRevision: 'r', classifierHeadRevision: 'h', calibrationRevision: 'c',
    });
    const role = buildClassificationObservationV1({
      requestId: 'r1', workspaceRevision: 'w1', task: 'code_role',
      labels: [{ label: 'PROJECTION_WRITER', probability: 0.95 }, { label: 'UNKNOWN', probability: 0.05 }],
      modelId: 'rules', modelRevision: 'r', classifierHeadRevision: 'h', calibrationRevision: 'c',
    });
    const patch = compileClassificationCandidateFeaturesV1([domain, role]);
    expect(patch.domain_fit_query).toBeCloseTo(0.9, 6);
    expect(patch.feature_label_confidence).toBeCloseTo(0.95, 6);
    expect(patch.sourceObservationIds).toHaveLength(2);
  });

  it('bridges classifier probabilities into weighted HMM observations without mutation authority', () => {
    const classification = buildClassificationObservationV1({
      requestId: 'r2', workspaceRevision: 'w1', task: 'error_type',
      labels: [{ label: 'stale_cache', probability: 0.8 }, { label: 'retrieval_miss', probability: 0.2 }],
      modelId: 'm', modelRevision: 'r', classifierHeadRevision: 'h', calibrationRevision: 'c',
    });
    const bridge = classificationObservationsToHmmV1({ sequenceId: 'seq1', classifications: [classification] });
    expect(bridge.observations[0].observation).toBe('error_type:stale_cache');
    expect(bridge.observations[0].weight).toBeCloseTo(0.8, 6);
    expect(bridge.canonicalWritesAllowed).toBe(false);
  });
});
