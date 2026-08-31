import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { OAK_2026_DSPY_CONTRACT_REVISION, OAK_2026_DSPY_POLICY_SCHEMA, verifyOak2026DspyProposalV1 } from './oak2026-dspy-policy-v1.js';

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
}
function sha256(value: unknown): string { return createHash('sha256').update(stableJson(value), 'utf8').digest('hex'); }
function proposal(overrides: Record<string, unknown> = {}) {
  const unsigned = {
    schema: OAK_2026_DSPY_POLICY_SCHEMA,
    contract_revision: OAK_2026_DSPY_CONTRACT_REVISION,
    kernel_revision: 'kernel:symbol-repair:v1',
    program_revision: 'oak2026-dspy-program:v1',
    query_id: 'query-1',
    function_id: 'fn:repair',
    bound_arguments: { symbolVersionId: 'symbol-version-1' },
    evidence_refs: ['evidence:1'],
    confidence: 0.9,
    canonical_authority: false as const,
    ...overrides,
  };
  return { ...unsigned, proposal_checksum: sha256(unsigned) };
}
const manifest = { kernelRevision: 'kernel:symbol-repair:v1', functionIds: ['fn:repair'] } as any;

describe('OaK 2026 DSPy proposal boundary', () => {
  it('accepts a checksummed allowed proposal', () => {
    const result = verifyOak2026DspyProposalV1({ manifest, proposal: proposal() as any, allowedEvidenceRefs: ['evidence:1'] });
    expect(result.function_id).toBe('fn:repair');
  });
  it('rejects a function outside frozen F', () => {
    expect(() => verifyOak2026DspyProposalV1({ manifest, proposal: proposal({ function_id: 'fn:other' }) as any, allowedEvidenceRefs: ['evidence:1'] })).toThrow('OAK_2026_DSPY_FUNCTION_NOT_IN_FROZEN_KERNEL');
  });
  it('rejects an evidence ref outside the supplied set', () => {
    expect(() => verifyOak2026DspyProposalV1({ manifest, proposal: proposal({ evidence_refs: ['evidence:other'] }) as any, allowedEvidenceRefs: ['evidence:1'] })).toThrow('OAK_2026_DSPY_UNKNOWN_EVIDENCE_REFS');
  });
  it('rejects a checksum mismatch', () => {
    const bad = proposal(); bad.proposal_checksum = '0'.repeat(64);
    expect(() => verifyOak2026DspyProposalV1({ manifest, proposal: bad as any, allowedEvidenceRefs: ['evidence:1'] })).toThrow('OAK_2026_DSPY_PROPOSAL_CHECKSUM_MISMATCH');
  });
});
