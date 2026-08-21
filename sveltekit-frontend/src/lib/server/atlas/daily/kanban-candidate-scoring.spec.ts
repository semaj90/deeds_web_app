import { describe, expect, it } from 'vitest';
import { computeKanbanPriority, type KanbanCandidateV1 } from './kanban-candidate-scoring.js';

function candidate(overrides: Partial<KanbanCandidateV1> = {}): KanbanCandidateV1 {
  return {
    schemaVersion: 'atlas.kanban-candidate.v1',
    candidateId: 'cand-1',
    title: 'Fix flaky retrieval lane',
    category: 'RETRIEVAL',
    utility: 1,
    confidence: 1,
    impact: 1,
    effort: 1,
    risk: 0,
    sourceEvidenceRefs: [],
    analyticsMerkleRoot: 'root-hex',
    featureRevision: 'rev-1',
    recommendationModelRevision: 'model-1',
    proposedGate: 'GATE_X',
    ...overrides,
  };
}

describe('computeKanbanPriority', () => {
  it('multiplies confidence * impact * utility over (effort + risk)', () => {
    const priority = computeKanbanPriority(
      candidate({ confidence: 0.8, impact: 2, utility: 1.5, effort: 1, risk: 0.5 }),
    );
    expect(priority).toBeCloseTo((0.8 * 2 * 1.5) / 1.5, 10);
  });

  it('never divides by zero — floors the denominator at 0.001', () => {
    const priority = computeKanbanPriority(
      candidate({ confidence: 1, impact: 1, utility: 1, effort: 0, risk: 0 }),
    );
    expect(Number.isFinite(priority)).toBe(true);
    expect(priority).toBeCloseTo(1 / 0.001, 5);
  });

  it('returns 0 when utility is 0 regardless of other factors', () => {
    const priority = computeKanbanPriority(
      candidate({ confidence: 1, impact: 10, utility: 0, effort: 1, risk: 0 }),
    );
    expect(priority).toBe(0);
  });

  it('higher risk lowers priority for otherwise-identical candidates', () => {
    const low = computeKanbanPriority(candidate({ effort: 1, risk: 0 }));
    const high = computeKanbanPriority(candidate({ effort: 1, risk: 5 }));
    expect(high).toBeLessThan(low);
  });
});