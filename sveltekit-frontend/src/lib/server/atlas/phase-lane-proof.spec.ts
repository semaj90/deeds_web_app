import { describe, expect, it } from 'vitest';
import {
  buildParentAtlasPhaseLaneProofReport,
  getParentAtlasPhaseLaneProofSnapshot,
} from './phase-lane-proof.js';

describe('parent atlas phase lane proof snapshot', () => {
  it('exposes a wired proof receipt for the semantic lane', () => {
    const snapshot = getParentAtlasPhaseLaneProofSnapshot();

    expect(snapshot.summary.total).toBe(1);
    expect(snapshot.summary.canonicalRepresentationId).toBe('semantic_768');
    expect(snapshot.summary.canonicalDimension).toBe(768);
    expect(snapshot.receipts[0]?.phase).toBe(15);
    expect(snapshot.receipts[0]?.proof_state).toBe('wired');
    expect(snapshot.receipts[0]?.proof_gate).toBe('SEMANTIC_LANE_WIRED_AND_TESTED');
    expect(snapshot.receipts[0]?.canonical_representation_id).toBe('semantic_768');
    expect(snapshot.receipts[0]?.canonical_dimension).toBe(768);
    expect(snapshot.receipts[0]?.test_command).toContain('semantic-packet-writer.spec.ts');
  });

  it('summarizes the proof receipt as a readable report', () => {
    const report = buildParentAtlasPhaseLaneProofReport();

    expect(report).toContain('Parent Atlas wired phase receipts: 1');
    expect(report).toContain('15. SEMANTIC_LANE_WIRED_AND_TESTED');
  });
});
