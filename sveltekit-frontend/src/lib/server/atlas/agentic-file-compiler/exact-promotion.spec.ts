import { describe, expect, it } from 'vitest';
import { promoteExactEvidence } from './exact-promotion.js';

describe('promoteExactEvidence', () => {
  it('fails closed on stale workspace revision', () => {
    const out = promoteExactEvidence({ requestId: 'r', candidateOrdinal: 0, canonicalId: 'c', expectedCanonicalId: 'c', workspaceRevision: 'w1', expectedWorkspaceRevision: 'w2', sourceRevision: 's1', approximateEvidenceRefs: [], exactEvidence: [{ sourceRef: 'a.ts', checksum: 'x' }] });
    expect(out.status).toBe('REJECTED_STALE');
  });
});
