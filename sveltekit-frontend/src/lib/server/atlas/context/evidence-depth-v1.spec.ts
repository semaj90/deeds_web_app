import { describe, expect, it } from 'vitest';
import {
  buildEvidenceDepthAxisV1,
  buildEvidenceDepthExpansionRequestV1,
  EvidenceDepthAxisV1Schema,
  EvidenceDepthExpansionRequestV1Schema,
  EvidenceDepthV1Schema,
} from './evidence-depth-v1.js';

const contextManifestChecksum = `sha256:${'a'.repeat(64)}`;

describe('EvidenceDepthV1', () => {
  it('defines D0-D6 as evidence-detail levels, with no D7', () => {
    const expectedKinds = [
      'TYPED_ORDINAL',
      'COMPACT_FEATURE_CARD',
      'LATENT_REPRESENTATION',
      'SEMANTIC_768',
      'PACKET_GROUNDED_ONTOLOGY_FACTS',
      'STRUCTURAL_NEIGHBORHOOD',
      'EXACT_SOURCE_SPANS',
    ];
    const depths = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6'] as const;
    for (const [index, depth] of depths.entries()) {
      expect(EvidenceDepthV1Schema.parse(depth)).toBe(depth);
      expect(buildEvidenceDepthAxisV1(depth).kind).toBe(expectedKinds[index]);
    }
    expect(EvidenceDepthV1Schema.safeParse('D7').success).toBe(false);
    expect(EvidenceDepthAxisV1Schema.safeParse({
      schema: 'atlas.evidence-depth-axis.v1',
      depth: 'D3',
      kind: 'SEMANTIC_768',
      canonicalAuthority: false,
      residencyTier: 'GPU',
    }).success).toBe(false);
    expect(EvidenceDepthAxisV1Schema.safeParse({
      schema: 'atlas.evidence-depth-axis.v1',
      depth: 'D3',
      kind: 'SEMANTIC_768',
      canonicalAuthority: false,
      modelExecutionState: 'KV_CACHE',
    }).success).toBe(false);
  });

  it('builds bounded, ContextManifest-bound expansion requests only toward deeper evidence', () => {
    const request = buildEvidenceDepthExpansionRequestV1({
      contextManifestChecksum,
      fromDepth: 'D1',
      targetDepth: 'D6',
      targetRef: 'packet://canonical/abc',
      maxEvidenceRefs: 8,
      maxBytes: 32_768,
    });
    expect(EvidenceDepthExpansionRequestV1Schema.parse(request)).toEqual(request);
    expect(request.canonicalAuthority).toBe(false);
    expect(() => buildEvidenceDepthExpansionRequestV1({ ...request, fromDepth: 'D4', targetDepth: 'D3' })).toThrow(/deeper/);
    expect(() => buildEvidenceDepthExpansionRequestV1({ ...request, fromDepth: 'D3', targetDepth: 'D3' })).toThrow(/deeper/);
    expect(EvidenceDepthExpansionRequestV1Schema.safeParse({ ...request, residencyTier: 'GPU' }).success).toBe(false);
    expect(EvidenceDepthExpansionRequestV1Schema.safeParse({ ...request, maxBytes: 262_145 }).success).toBe(false);
  });
});
