import { describe, expect, it } from 'vitest';
import {
  computeFeatureContentChecksumV1,
  isFeatureCurrentForSourceRevision,
  validateFeatureEnvelopeV1,
  type FeatureEnvelopeBodyV1,
} from './feature-envelope-v1.js';

const SHA = 'sha256:' + 'a'.repeat(64);
const SHA_B = 'sha256:' + 'c'.repeat(64);
const WS = 'sha256:' + 'b'.repeat(64);
const PACKET_V5 = '3f2504e0-4f89-5d3c-9a6b-1c2d3e4f5a6b';
const TOOLCHAIN = 'd'.repeat(64);

const body = (over: Partial<FeatureEnvelopeBodyV1> = {}): FeatureEnvelopeBodyV1 => ({
  schema: 'atlas.feature-envelope.v1',
  canonicalId: 'concept.chat',
  packetKey: PACKET_V5,
  sourceRevision: SHA,
  workspaceRevision: WS,
  featureKind: 'SYMBOL',
  featureName: 'handleSend',
  featureValue: 'function',
  sourceSpan: [10, 42],
  evidenceRefs: ['ast:src/a.ts:10-42'],
  producerRevision: 'ts-ast-v1',
  featureRevision: 'feature-extractor-v1',
  authority: 'DETERMINISTIC',
  reviewStatus: 'OBSERVED',
  ...over,
});

const sealed = (b: FeatureEnvelopeBodyV1) => ({ ...b, contentChecksum: computeFeatureContentChecksumV1(b) });

describe('FeatureEnvelopeV1', () => {
  it('accepts a sealed deterministic symbol feature', () => {
    const result = validateFeatureEnvelopeV1(sealed(body()));
    expect(result.ok).toBe(true);
  });

  it('computes the same checksum regardless of key order', () => {
    const b = body();
    const reordered = Object.fromEntries(Object.entries(b).reverse()) as FeatureEnvelopeBodyV1;
    expect(computeFeatureContentChecksumV1(reordered)).toBe(computeFeatureContentChecksumV1(b));
  });

  it('changes the checksum when any field changes', () => {
    expect(computeFeatureContentChecksumV1(body({ featureValue: 'class' })))
      .not.toBe(computeFeatureContentChecksumV1(body()));
  });

  it('rejects a tampered envelope whose checksum no longer matches', () => {
    const tampered = { ...sealed(body()), featureValue: 'class' };
    const result = validateFeatureEnvelopeV1(tampered);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.issues.join(' ')).toContain('CONTENT_CHECKSUM_MISMATCH');
  });

  it('rejects a packetKey that is not UUIDv5 (never minted here)', () => {
    const v4 = '3f2504e0-4f89-4d3c-9a6b-1c2d3e4f5a6b';
    const result = validateFeatureEnvelopeV1(sealed(body({ packetKey: v4 })));
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown extra field (strict schema)', () => {
    const result = validateFeatureEnvelopeV1({ ...sealed(body()), sneaky: true });
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed or missing revision', () => {
    expect(validateFeatureEnvelopeV1(sealed(body({ sourceRevision: 'abc' }))).ok).toBe(false);
    expect(validateFeatureEnvelopeV1(sealed(body({ workspaceRevision: 'sha256:short' }))).ok).toBe(false);
  });

  it('rejects an empty evidence list', () => {
    expect(validateFeatureEnvelopeV1(sealed(body({ evidenceRefs: [] }))).ok).toBe(false);
  });

  it('requires an exact source span for symbol and diagnostic kinds', () => {
    const noSpan = body({ sourceSpan: undefined });
    expect(validateFeatureEnvelopeV1(sealed(noSpan)).ok).toBe(false);
    expect(validateFeatureEnvelopeV1(sealed(body({ featureKind: 'DIAGNOSTIC', sourceSpan: undefined }))).ok).toBe(false);
  });

  it('rejects an inverted or empty source span', () => {
    expect(validateFeatureEnvelopeV1(sealed(body({ sourceSpan: [42, 10] }))).ok).toBe(false);
    expect(validateFeatureEnvelopeV1(sealed(body({ sourceSpan: [10, 10] }))).ok).toBe(false);
  });

  it('requires modelRevision for MODEL_PROPOSAL features', () => {
    const b = body({ authority: 'MODEL_PROPOSAL', reviewStatus: 'UNRESOLVED', featureKind: 'DOMAIN_PROPOSAL', sourceSpan: undefined });
    expect(validateFeatureEnvelopeV1(sealed(b)).ok).toBe(false);
    expect(validateFeatureEnvelopeV1(sealed({ ...b, modelRevision: 'tree-v1' })).ok).toBe(true);
  });

  it('never accepts a model proposal or concept proposal as OBSERVED', () => {
    const modelObserved = body({
      authority: 'MODEL_PROPOSAL', modelRevision: 'tree-v1', reviewStatus: 'OBSERVED',
      featureKind: 'DOMAIN_PROPOSAL', sourceSpan: undefined,
    });
    expect(validateFeatureEnvelopeV1(sealed(modelObserved)).ok).toBe(false);
    const conceptObserved = body({ featureKind: 'CONCEPT_PROPOSAL', reviewStatus: 'OBSERVED', sourceSpan: undefined });
    expect(validateFeatureEnvelopeV1(sealed(conceptObserved)).ok).toBe(false);
  });

  it('keeps an ambiguous concept label UNRESOLVED without admission', () => {
    const ambiguous = body({ featureKind: 'CONCEPT_PROPOSAL', reviewStatus: 'UNRESOLVED', sourceSpan: undefined });
    const result = validateFeatureEnvelopeV1(sealed(ambiguous));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.envelope.reviewStatus).toBe('UNRESOLVED');
  });

  it('requires toolchainBindingChecksum for COMPILER_QUALIFIED features', () => {
    const compiler = body({ authority: 'COMPILER_QUALIFIED', featureKind: 'DIAGNOSTIC' });
    expect(validateFeatureEnvelopeV1(sealed(compiler)).ok).toBe(false);
    expect(validateFeatureEnvelopeV1(sealed({ ...compiler, toolchainBindingChecksum: TOOLCHAIN })).ok).toBe(true);
  });

  it('reports a feature as stale when its source revision no longer matches', () => {
    const result = validateFeatureEnvelopeV1(sealed(body()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isFeatureCurrentForSourceRevision(result.envelope, SHA)).toBe(true);
    expect(isFeatureCurrentForSourceRevision(result.envelope, SHA_B)).toBe(false);
  });
});
