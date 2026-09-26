// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildResearchEvidenceBundleV1, researchEvidenceBundleChecksumV1, researchEvidenceBundleV1Schema, researchEvidenceSetChecksumV1,
} from './research-evidence-bundle-v1.js';

const D = 'sha256:' + 'a'.repeat(64);
const WS = 'sha256:' + 'c'.repeat(64);
const ev = (id: string, over: Record<string, unknown> = {}) => ({
  schema: 'atlas.research-evidence.v1', evidenceId: id, sourceKind: 'CODE', sourceRef: 'src/a.ts', sourceRevision: 'sha256:' + 'b'.repeat(64), contentDigest: D,
  proposition: `p-${id}`, confidence: 0.5, evidenceRefs: ['ast:1'], webProvenance: null, producerRevision: 'r1', canonicalAuthority: false, ...over,
}) as never;
const make = (evidence = [ev('a'), ev('b')]) => buildResearchEvidenceBundleV1({ requestId: 'req-1', workspaceRevision: WS, evidence, producerRevision: 'r1' });

describe('ResearchEvidenceBundleV1', () => {
  it('seals, parses, and never claims writes or authority', () => {
    const b = make();
    expect(researchEvidenceBundleV1Schema.safeParse(b).success).toBe(true);
    expect(b.writesPerformed).toBe(false);
    expect(b.canonicalAuthority).toBe(false);
  });
  it('reordering evidence keeps evidenceSetChecksum and bundleChecksum', () => {
    const x = make([ev('a'), ev('b')]);
    const y = make([ev('b'), ev('a')]);
    expect(y.evidenceSetChecksum).toBe(x.evidenceSetChecksum);
    expect(y.bundleChecksum).toBe(x.bundleChecksum);
    expect(researchEvidenceBundleV1Schema.safeParse(y).success).toBe(true);
  });
  it('changing evidence content changes both evidenceSetChecksum and bundleChecksum', () => {
    const x = make([ev('a'), ev('b')]);
    const y = make([ev('a', { proposition: 'changed' }), ev('b')]);
    expect(y.evidenceSetChecksum).not.toBe(x.evidenceSetChecksum);
    expect(y.bundleChecksum).not.toBe(x.bundleChecksum);
  });
  it('changing a non-evidence field changes bundleChecksum but not evidenceSetChecksum', () => {
    const x = make();
    const y = buildResearchEvidenceBundleV1({ requestId: 'req-2', workspaceRevision: WS, evidence: [ev('a'), ev('b')], producerRevision: 'r1' });
    expect(y.evidenceSetChecksum).toBe(x.evidenceSetChecksum);
    expect(y.bundleChecksum).not.toBe(x.bundleChecksum);
  });
  it('rejects empty bundles, duplicate ids, and every tamper', () => {
    const b = make();
    expect(researchEvidenceBundleV1Schema.safeParse({ ...b, evidence: [] }).success).toBe(false);
    expect(() => researchEvidenceBundleV1Schema.parse({ ...b, evidence: [ev('a'), ev('a')] })).toThrow('DUPLICATE_EVIDENCE_ID');
    expect(() => researchEvidenceBundleV1Schema.parse({ ...b, evidence: [ev('a', { proposition: 'changed' }), ev('b')] })).toThrow('EVIDENCE_SET_CHECKSUM_MISMATCH');
    expect(() => researchEvidenceBundleV1Schema.parse({ ...b, requestId: 'req-2' })).toThrow('BUNDLE_CHECKSUM_MISMATCH');
    expect(() => researchEvidenceBundleV1Schema.parse({ ...b, workspaceRevision: 'sha256:' + 'd'.repeat(64) })).toThrow('BUNDLE_CHECKSUM_MISMATCH');
    expect(() => researchEvidenceBundleV1Schema.parse({ ...b, evidenceSetChecksum: 'sha256:' + 'e'.repeat(64) })).toThrow('EVIDENCE_SET_CHECKSUM_MISMATCH');
  });
  it('does not repair nested lineage: an item without its own revision is rejected, not normalized', () => {
    expect(() => make([ev('a', { sourceRevision: null })])).toThrow('SOURCE_REVISION_REQUIRED');
  });
  it('is strict', () => {
    expect(researchEvidenceBundleV1Schema.safeParse({ ...make(), writesPerformed: true }).success).toBe(false);
    expect(researchEvidenceBundleV1Schema.safeParse({ ...make(), canonicalAuthority: true }).success).toBe(false);
    expect(researchEvidenceBundleV1Schema.safeParse({ ...make(), extra: 1 }).success).toBe(false);
    expect(researchEvidenceBundleChecksumV1(make())).toBe(make().bundleChecksum);
    expect(researchEvidenceSetChecksumV1(make().evidence)).toBe(make().evidenceSetChecksum);
  });
});
