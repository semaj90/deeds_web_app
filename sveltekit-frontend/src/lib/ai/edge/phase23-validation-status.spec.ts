import { describe, expect, it } from 'vitest';
import { PHASE23_EDGE_GATES, summarizeEdgeGates } from './phase23-validation-status.js';
describe('Phase23 evidence ledger', () => {
  it('does not promote unrun gates', () => {
    const result = summarizeEdgeGates();
    expect(result.pass).toBe(0);
    expect(result.notProven).toBe(PHASE23_EDGE_GATES.length);
    expect(result.missing.length).toBeGreaterThan(0);
  });
  it('rejects an unsupported PASS', () => {
    expect(() => summarizeEdgeGates([{ id: 'X', status: 'PASS', missing: [], proofRefs: [], description: 'bad' }])).toThrow(/unsupported PASS/);
  });
  it('rejects repeated gate IDs', () => {
    const x = { id: 'X', status: 'NOT_PROVEN' as const, missing: ['run'], proofRefs: [], description: 'x' };
    expect(() => summarizeEdgeGates([x, x])).toThrow(/duplicate gate/);
  });
});
