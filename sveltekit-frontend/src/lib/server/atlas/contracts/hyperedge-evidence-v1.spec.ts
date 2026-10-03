import { describe, expect, it } from 'vitest';
import { createHyperedgeV1 } from '../../graph/hyperedge-contract.js';
import { buildHyperEdgeEvidenceV1, hyperEdgeEvidenceV1Schema } from './hyperedge-evidence-v1.js';

const digest = `sha256:${'a'.repeat(64)}`;
const evidenceRef = 'source:code:src/example.ts#L1-L4';
const edge = createHyperedgeV1({
  predicate: 'SUPPORTS',
  participants: [{ canonicalId: 'symbol:alpha', role: 'claim' }, { canonicalId: 'source:example', role: 'source' }],
  evidenceRefs: [evidenceRef],
  workspaceRevision: 'workspace:rev-1',
  graphRevision: 'graph:rev-1',
  sourceRevision: 'source:rev-1',
  producerRevision: 'graphify:rev-1',
});
const item = {
  schema: 'atlas.research-evidence.v1' as const,
  evidenceId: 'evidence:alpha',
  sourceKind: 'CODE' as const,
  sourceRef: 'src/example.ts',
  sourceRevision: 'source:rev-1',
  contentDigest: digest,
  proposition: 'The source supports the claim.',
  confidence: 0.9,
  evidenceRefs: [evidenceRef],
  webProvenance: null,
  producerRevision: 'research:rev-1',
  canonicalAuthority: false as const,
};
const build = () => buildHyperEdgeEvidenceV1({ hyperedge: edge, evidence: [item], bindings: [{ evidenceId: item.evidenceId, evidenceRef }], producerRevision: 'test:rev-1' });

describe('HyperEdgeEvidenceV1', () => {
  it('seals an evidence envelope around the existing hyperedge without claiming authority or writes', () => {
    const value = build();
    expect(hyperEdgeEvidenceV1Schema.parse(value)).toEqual(value);
    expect(value.writesPerformed).toBe(false);
    expect(value.canonicalAuthority).toBe(false);
  });

  it('rejects a binding whose evidence ref is not cited by the item', () => {
    const value = build();
    expect(hyperEdgeEvidenceV1Schema.safeParse({
      ...value,
      bindings: [{ evidenceId: item.evidenceId, evidenceRef: 'source:unrelated' }],
    }).success).toBe(false);
  });

  it('rejects edge evidence refs not fully represented by bindings', () => {
    const value = build();
    expect(hyperEdgeEvidenceV1Schema.safeParse({
      ...value,
      hyperedge: { ...edge, evidenceRefs: [evidenceRef, 'source:missing'] },
    }).success).toBe(false);
  });

  it('rejects a tampered checksum and authority escalation', () => {
    const value = build();
    expect(hyperEdgeEvidenceV1Schema.safeParse({ ...value, checksum: digest }).success).toBe(false);
    expect(hyperEdgeEvidenceV1Schema.safeParse({ ...value, canonicalAuthority: true }).success).toBe(false);
  });
});
