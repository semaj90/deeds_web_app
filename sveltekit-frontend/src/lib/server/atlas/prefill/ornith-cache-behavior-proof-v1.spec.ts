import { describe, expect, it } from 'vitest';
import { buildOrnithCacheBehaviorProofV1 } from './ornith-cache-behavior-proof-v1.js';

const sha = (character: string) => character.repeat(64);

function baseInput() {
  return {
    proofRevision: 'ornith-cache-behavior-proof:r1',
    runtimeRevision: 'b8757-a29e4c0b7',
    modelRevision: 'ornith-1.5-9b',
    probeMode: 'FIXTURE' as const,
    productionWritesPerformed: false,
    runtimeCacheStateChanged: false,
    sameIdentity: {
      prefixIdentityChecksum: sha('a'),
      telemetryAvailable: false,
      coldCachedPrefillTokens: 0,
      warmCachedPrefillTokens: 0,
      warmNewPrefillTokens: 0,
    },
    outputParity: {
      coldOutputChecksum: null,
      warmOutputChecksum: null,
      coldToolShapeChecksum: null,
      warmToolShapeChecksum: null,
    },
    crossIdentityIsolation: {
      identityAChecksum: sha('b'),
      identityBChecksum: sha('c'),
      telemetryAvailable: false,
      cachedPrefillTokensObserved: null,
    },
    evidenceRefs: ['report:ornith-cache-behavior-fixture'],
  };
}

describe('OrnithCacheBehaviorProofV1', () => {
  it('keeps metadata-only fixtures unproven', () => {
    const proof = buildOrnithCacheBehaviorProofV1(baseInput());
    expect(proof.sameIdentity.verdict).toBe('UNPROVEN');
    expect(proof.outputParity.verdict).toBe('UNPROVEN');
    expect(proof.crossIdentityIsolation.verdict).toBe('UNPROVEN');
  });

  it('proves reuse only when warm telemetry reports cached prefill', () => {
    const proof = buildOrnithCacheBehaviorProofV1({
      ...baseInput(),
      sameIdentity: {
        ...baseInput().sameIdentity,
        telemetryAvailable: true,
        warmCachedPrefillTokens: 128,
        warmNewPrefillTokens: 12,
      },
    });
    expect(proof.sameIdentity.verdict).toBe('PROVEN_TRUE');
  });

  it('proves output and tool-shape parity only from matching checksums', () => {
    const proof = buildOrnithCacheBehaviorProofV1({
      ...baseInput(),
      outputParity: {
        coldOutputChecksum: sha('d'),
        warmOutputChecksum: sha('d'),
        coldToolShapeChecksum: sha('e'),
        warmToolShapeChecksum: sha('e'),
      },
    });
    expect(proof.outputParity.verdict).toBe('PROVEN_TRUE');
  });

  it('proves cross-identity isolation only with telemetry and zero reuse', () => {
    const proof = buildOrnithCacheBehaviorProofV1({
      ...baseInput(),
      crossIdentityIsolation: {
        ...baseInput().crossIdentityIsolation,
        telemetryAvailable: true,
        cachedPrefillTokensObserved: 0,
      },
    });
    expect(proof.crossIdentityIsolation.verdict).toBe('PROVEN_TRUE');
  });

  it('rejects an isolation comparison that uses the same identity twice', () => {
    expect(() => buildOrnithCacheBehaviorProofV1({
      ...baseInput(),
      crossIdentityIsolation: {
        ...baseInput().crossIdentityIsolation,
        identityBChecksum: sha('b'),
      },
    })).toThrow('distinct prefix identities');
  });
});
