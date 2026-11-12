import { describe, expect, it } from 'vitest';
import { buildGroundedRecommendationV1 } from './grounded-recommendation-v1.js';

describe('grounded recommendation contract', () => {
  it('accepts only uniquely identity- and revision-bound source cards', () => {
    const result = buildGroundedRecommendationV1({ cards: [
      { title: 'Source', sourceRef: 'scripts/atlas/search.mjs#L4', retrievalUsable: true, identityBound: true, packetBindings: [{ packetKey: 'packet:a', sourceRevision: 'sha256:abc', sha256: 'abc' }] },
      { sourceRef: 'src/unbound.ts', retrievalUsable: true, identityBound: false, packetBindings: [{ sourceRevision: 'sha256:def' }] },
      { sourceRef: 'src/conflict.ts', retrievalUsable: true, identityBound: true, identityConflict: true, packetBindings: [{ sourceRevision: 'sha256:ghi' }] },
    ] });
    expect(result.patch_targets).toEqual(['scripts/atlas/search.mjs']);
    expect(result.evidence[0].source_revision).toBe('sha256:abc');
    expect(result.canonicalAuthority).toBe(false);
  });

  it('keeps unresolved or unsafe sources from becoming patch targets', () => {
    const result = buildGroundedRecommendationV1({ cards: [
      { sourceRef: '../private.ts', retrievalUsable: true, identityBound: true, packetBindings: [{ workspaceRevision: 'rev' }] },
    ] });
    expect(result.patch_targets).toEqual([]);
    expect(result.safe_next_command).toBe('git diff --check');
    expect(buildGroundedRecommendationV1({}).safe_next_command).toBeNull();
  });
});
