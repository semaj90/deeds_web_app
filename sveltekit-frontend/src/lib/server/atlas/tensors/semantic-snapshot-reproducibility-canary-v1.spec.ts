import { describe, expect, it } from 'vitest';
import {
  FP16_NUMERIC_EXACT_MAX_ULP,
  SemanticSnapshotReproducibilityCanaryEvidenceV1Schema,
  binary16UlpDistance,
  buildSemanticSnapshotReproducibilityCanaryEvidenceV1,
  classifyFp16Reproducibility,
  digestBinary16,
  toBinary16Bits,
} from './semantic-snapshot-reproducibility-canary-v1.js';

const step = (bits: number): number => {
  // exact value of a positive normal binary16 bit pattern, for building neighbours in tests
  const exp = (bits >> 10) & 31;
  const man = bits & 1023;
  return exp === 0 ? man * 2 ** -24 : (1 + man / 1024) * 2 ** (exp - 15);
};

describe('binary16 conversion (round-to-nearest-even)', () => {
  it('encodes known values', () => {
    expect(toBinary16Bits(1)).toBe(0x3c00);
    expect(toBinary16Bits(-2)).toBe(0xc000);
    expect(toBinary16Bits(65504)).toBe(0x7bff);
    expect(toBinary16Bits(2 ** -14)).toBe(0x0400);
    expect(toBinary16Bits(2 ** -24)).toBe(0x0001);
    expect(toBinary16Bits(0)).toBe(0);
    expect(toBinary16Bits(-0)).toBe(0x8000);
  });

  it('breaks exact ties to the even mantissa', () => {
    expect(toBinary16Bits(1 + 2 ** -11)).toBe(0x3c00); // halfway 1.0 / 1+2^-10 -> even (1.0)
    expect(toBinary16Bits(1 + 3 * 2 ** -11)).toBe(0x3c02); // halfway 0x3c01 / 0x3c02 -> even
  });

  it('rejects non-finite input', () => {
    expect(() => toBinary16Bits(Number.NaN)).toThrow(RangeError);
    expect(() => toBinary16Bits(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('binary16 ULP distance', () => {
  it('counts representable steps, independent of magnitude', () => {
    expect(binary16UlpDistance(step(0x3c00), step(0x3c01))).toBe(1);
    expect(binary16UlpDistance(step(0x0c00), step(0x0c01))).toBe(1);
    expect(binary16UlpDistance(step(0x3c00), step(0x3c03))).toBe(3);
  });

  it('treats +0 and -0 as identical and measures across zero', () => {
    expect(binary16UlpDistance(0, -0)).toBe(0);
    expect(binary16UlpDistance(2 ** -24, -(2 ** -24))).toBe(2);
  });

  it('is infinite for non-finite input', () => {
    expect(binary16UlpDistance(Number.NaN, 1)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('classifyFp16Reproducibility (frozen criterion)', () => {
  const base = Array.from({ length: 768 }, (_, i) => step(0x2800 + (i % 200)) * (i % 2 === 0 ? 1 : -1));

  it('is frozen at one binary16 step', () => {
    expect(FP16_NUMERIC_EXACT_MAX_ULP).toBe(1);
  });

  it('identical vectors are DIGEST_EXACT', () => {
    const r = classifyFp16Reproducibility(base, [...base]);
    expect(r).toEqual({ class: 'RECIPE_DIGEST_EXACT', maxUlp: 0, elementsDiffering: 0 });
  });

  it('one element one step away is NUMERIC_EXACT', () => {
    const other = [...base];
    other[10] = step(0x2800 + 11 + 1); // neighbouring representable value of element 10's magnitude
    const near = [...base];
    near[10] = base[10] > 0 ? step(toBinary16Bits(base[10]) + 1) : -step((toBinary16Bits(base[10]) & 0x7fff) + 1);
    const r = classifyFp16Reproducibility(base, near);
    expect(r.class).toBe('RECIPE_NUMERIC_EXACT');
    expect(r.maxUlp).toBe(1);
    expect(r.elementsDiffering).toBe(1);
    expect(other.length).toBe(768);
  });

  it('many elements each one step away are still NUMERIC_EXACT (per element, not summed)', () => {
    const near = base.map((v) => (v > 0 ? step(toBinary16Bits(v) + 1) : -step((toBinary16Bits(v) & 0x7fff) + 1)));
    const r = classifyFp16Reproducibility(base, near);
    expect(r.class).toBe('RECIPE_NUMERIC_EXACT');
    expect(r.elementsDiffering).toBe(768);
  });

  it('two steps on any element is SEMANTIC_MATCH_ONLY even with near-identical cosine', () => {
    const far = [...base];
    far[5] = base[5] > 0 ? step(toBinary16Bits(base[5]) + 2) : -step((toBinary16Bits(base[5]) & 0x7fff) + 2);
    const r = classifyFp16Reproducibility(base, far);
    expect(r.class).toBe('RECIPE_SEMANTIC_MATCH_ONLY');
    expect(r.maxUlp).toBe(2);
  });

  it('dimension mismatch, empty input and non-finite values never qualify', () => {
    expect(classifyFp16Reproducibility(base, base.slice(1)).class).toBe('RECIPE_SEMANTIC_MATCH_ONLY');
    expect(classifyFp16Reproducibility([], []).class).toBe('RECIPE_SEMANTIC_MATCH_ONLY');
    const nan = [...base];
    nan[0] = Number.NaN;
    expect(classifyFp16Reproducibility(base, nan).class).toBe('RECIPE_SEMANTIC_MATCH_ONLY');
  });

  it('+0 versus -0 is numeric-equal but not byte-identical', () => {
    const a = [0, ...base.slice(1)];
    const b = [-0, ...base.slice(1)];
    expect(digestBinary16(a)).not.toBe(digestBinary16(b));
    expect(classifyFp16Reproducibility(a, b).class).toBe('RECIPE_NUMERIC_EXACT');
  });

  it('digest is order sensitive', () => {
    const swapped = [...base];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(digestBinary16(swapped)).not.toBe(digestBinary16(base));
  });
});

// Synthetic fixture values only. The counts mirror the reviewed cohort; every checksum is a placeholder.
const hex = (c: string): string => c.repeat(64);
const validInput = () => ({
  schema: 'atlas.semantic-snapshot-reproducibility-canary-evidence.v1' as const,
  subjectSnapshotId: 'synthetic-snapshot-id',
  coverageClass: 'REVISION_QUALIFIED_CURRENT_RUNTIME_REPRODUCIBLE' as const,
  evidenceGrade: 'CURRENT_RUNTIME_REPRODUCIBLE' as const,
  canonicalAuthority: false as const,
  promotionEligible: false as const,
  historicalModelArtifactVerified: false as const,
  representation: {
    representationId: 'semantic_768' as const,
    historicalModelArtifact: { status: 'UNRESOLVED' as const, alias: 'embeddinggemma:latest' },
  },
  rowCount: 6774,
  recipeCounts: { 'eg-task-prefix-v1': 6312, 'unprompted-v0': 462 },
  reproducibility: { toleranceUlp: 1 as const, digestExact: 6453, numericExact: 321, semanticMatchOnly: 0 as const },
  sourceLineageChecksum: hex('a'),
  recipeEvidenceChecksum: hex('b'),
  orderedCanonicalIdsChecksum: hex('c'),
  measurementRuntime: {
    purpose: 'REPRODUCIBILITY_MEASUREMENT_ONLY' as const,
    engine: 'ollama',
    modelAlias: 'embeddinggemma:latest',
    currentRuntimeArtifactDigest: hex('d'),
  },
  dimension: 768 as const,
  scalarType: 'fp16' as const,
  knownHistoricalDefects: ['WRITE_FLAG_CONTRADICTS_REPORTED_UPDATE_COUNT' as const],
});

describe('SemanticSnapshotReproducibilityCanaryEvidenceV1', () => {
  it('builds a valid, self-identifying evidence record deterministically', () => {
    const a = buildSemanticSnapshotReproducibilityCanaryEvidenceV1(validInput());
    const b = buildSemanticSnapshotReproducibilityCanaryEvidenceV1(validInput());
    expect(a.evidenceId).toBe(b.evidenceId);
    expect(a.evidenceId).toMatch(/^canary-evidence:[0-9a-f]{64}$/);
    expect(SemanticSnapshotReproducibilityCanaryEvidenceV1Schema.safeParse(a).success).toBe(true);
  });

  it('id is independent of key order but sensitive to content', () => {
    const reordered = Object.fromEntries(Object.entries(validInput()).reverse()) as ReturnType<typeof validInput>;
    expect(buildSemanticSnapshotReproducibilityCanaryEvidenceV1(reordered).evidenceId).toBe(
      buildSemanticSnapshotReproducibilityCanaryEvidenceV1(validInput()).evidenceId,
    );
    const changed = { ...validInput(), subjectSnapshotId: 'other' };
    expect(buildSemanticSnapshotReproducibilityCanaryEvidenceV1(changed).evidenceId).not.toBe(
      buildSemanticSnapshotReproducibilityCanaryEvidenceV1(validInput()).evidenceId,
    );
  });

  it('cannot express canonical authority, promotion or a verified historical artifact', () => {
    const built = buildSemanticSnapshotReproducibilityCanaryEvidenceV1(validInput());
    for (const patch of [
      { canonicalAuthority: true },
      { promotionEligible: true },
      { historicalModelArtifactVerified: true },
      { evidenceGrade: 'HISTORICAL_ARTIFACT_EXACT' },
      { coverageClass: 'REVISION_QUALIFIED_CANARY' },
      { representation: { representationId: 'semantic_768', historicalModelArtifact: { status: 'EXACT', alias: 'x' } } },
    ]) {
      expect(SemanticSnapshotReproducibilityCanaryEvidenceV1Schema.safeParse({ ...built, ...patch }).success).toBe(false);
    }
  });

  it('rejects inconsistent counts and any semantic-match-only row', () => {
    expect(() => buildSemanticSnapshotReproducibilityCanaryEvidenceV1({ ...validInput(), rowCount: 6775 })).toThrow();
    const badRepro = { ...validInput(), reproducibility: { toleranceUlp: 1, digestExact: 6000, numericExact: 321, semanticMatchOnly: 0 } };
    expect(() => buildSemanticSnapshotReproducibilityCanaryEvidenceV1(badRepro as never)).toThrow();
    const semantic = { ...validInput(), reproducibility: { toleranceUlp: 1, digestExact: 6452, numericExact: 321, semanticMatchOnly: 1 } };
    expect(() => buildSemanticSnapshotReproducibilityCanaryEvidenceV1(semantic as never)).toThrow();
  });

  it('rejects a tampered evidenceId, unknown keys and malformed checksums', () => {
    const built = buildSemanticSnapshotReproducibilityCanaryEvidenceV1(validInput());
    expect(SemanticSnapshotReproducibilityCanaryEvidenceV1Schema.safeParse({ ...built, evidenceId: 'canary-evidence:tampered' }).success).toBe(false);
    expect(SemanticSnapshotReproducibilityCanaryEvidenceV1Schema.safeParse({ ...built, extra: 1 }).success).toBe(false);
    expect(() => buildSemanticSnapshotReproducibilityCanaryEvidenceV1({ ...validInput(), sourceLineageChecksum: 'not-hex' })).toThrow();
  });
});
