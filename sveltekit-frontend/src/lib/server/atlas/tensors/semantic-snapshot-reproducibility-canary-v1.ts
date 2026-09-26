import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

/**
 * Noncanonical evidence layer for a semantic_768 snapshot whose vectors are
 * reproducible by the CURRENT runtime but whose historical model artifact is
 * unresolved. It qualifies an existing SemanticSnapshotManifest
 * (tensor-artifact-contract.ts) by id; it is NOT a second snapshot manifest and
 * never a promotion path. Reproducibility is not provenance.
 */

export const REPRESENTATION_EVIDENCE_GRADES = [
  'HISTORICAL_ARTIFACT_EXACT',
  'CURRENT_RUNTIME_REPRODUCIBLE',
  'ALIAS_ONLY',
  'UNRESOLVED',
] as const;
export type RepresentationEvidenceGradeV1 = (typeof REPRESENTATION_EVIDENCE_GRADES)[number];

/** Frozen from binary16 semantics before any measurement: one representable step per element. */
export const FP16_NUMERIC_EXACT_MAX_ULP = 1 as const;

const RNE = (q: number): number => {
  const whole = Math.trunc(q);
  const frac = q - whole;
  return frac > 0.5 ? whole + 1 : frac < 0.5 ? whole : whole % 2 === 0 ? whole : whole + 1;
};

/** IEEE 754 binary16 bits, round-to-nearest-even. Non-finite input is not representable here. */
export function toBinary16Bits(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('binary16 conversion requires a finite value');
  if (value === 0) return Object.is(value, -0) ? 0x8000 : 0;
  const sign = value < 0 ? 0x8000 : 0;
  const a = Math.abs(value);
  if (a >= 65520) return sign | 0x7c00; // rounds to infinity
  if (a < 2 ** -14) return sign | RNE(a / 2 ** -24);
  let e = Math.floor(Math.log2(a));
  if (2 ** e > a) e -= 1;
  if (2 ** (e + 1) <= a) e += 1;
  let mantissa = RNE((a / 2 ** e - 1) * 1024);
  if (mantissa === 1024) {
    mantissa = 0;
    e += 1;
  }
  return sign | ((e + 15) << 10) | mantissa;
}

/** Monotonic integer ordering of binary16 bit patterns; +0 and -0 both map to 0. */
function orderedBinary16(bits: number): number {
  return bits & 0x8000 ? -(bits & 0x7fff) : bits & 0x7fff;
}

/** Distance in representable binary16 steps between two values after RNE conversion. */
export function binary16UlpDistance(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(orderedBinary16(toBinary16Bits(a)) - orderedBinary16(toBinary16Bits(b)));
}

/** SHA-256 over the little-endian binary16 byte encoding of a vector, in element order. */
export function digestBinary16(vector: ArrayLike<number>): string {
  const bytes = new Uint16Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) bytes[i] = toBinary16Bits(vector[i]);
  return createHash('sha256').update(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)).digest('hex');
}

export type Fp16ReproducibilityClass =
  | 'RECIPE_DIGEST_EXACT'
  | 'RECIPE_NUMERIC_EXACT'
  | 'RECIPE_SEMANTIC_MATCH_ONLY';

export interface Fp16ReproducibilityResult {
  class: Fp16ReproducibilityClass;
  maxUlp: number;
  elementsDiffering: number;
}

/**
 * Pre-specified criterion. DIGEST_EXACT: canonical binary16 encodings match byte for byte.
 * NUMERIC_EXACT: same dimension/order and every element within FP16_NUMERIC_EXACT_MAX_ULP
 * (per element, not summed). Anything else, however high its cosine, is SEMANTIC_MATCH_ONLY.
 */
export function classifyFp16Reproducibility(
  stored: ArrayLike<number>,
  recomputed: ArrayLike<number>,
): Fp16ReproducibilityResult {
  if (stored.length !== recomputed.length || stored.length === 0) {
    return { class: 'RECIPE_SEMANTIC_MATCH_ONLY', maxUlp: Number.POSITIVE_INFINITY, elementsDiffering: stored.length };
  }
  let maxUlp = 0;
  let elementsDiffering = 0;
  for (let i = 0; i < stored.length; i += 1) {
    const ulp = binary16UlpDistance(stored[i], recomputed[i]);
    if (ulp > 0) elementsDiffering += 1;
    if (ulp > maxUlp) maxUlp = ulp;
  }
  if (maxUlp > FP16_NUMERIC_EXACT_MAX_ULP) return { class: 'RECIPE_SEMANTIC_MATCH_ONLY', maxUlp, elementsDiffering };
  const digestEqual = digestBinary16(stored) === digestBinary16(recomputed);
  return { class: digestEqual ? 'RECIPE_DIGEST_EXACT' : 'RECIPE_NUMERIC_EXACT', maxUlp, elementsDiffering };
}

const Hex64 = z.string().regex(/^[0-9a-f]{64}$/);

const CanaryEvidenceBodyShape = {
  schema: z.literal('atlas.semantic-snapshot-reproducibility-canary-evidence.v1'),
  /** id of the existing SemanticSnapshotManifest this evidence qualifies */
  subjectSnapshotId: z.string().min(1),
  coverageClass: z.literal('REVISION_QUALIFIED_CURRENT_RUNTIME_REPRODUCIBLE'),
  evidenceGrade: z.literal('CURRENT_RUNTIME_REPRODUCIBLE'),
  canonicalAuthority: z.literal(false),
  promotionEligible: z.literal(false),
  historicalModelArtifactVerified: z.literal(false),
  representation: z
    .object({
      representationId: z.literal('semantic_768'),
      historicalModelArtifact: z.object({ status: z.literal('UNRESOLVED'), alias: z.string().min(1) }).strict(),
    })
    .strict(),
  rowCount: z.number().int().positive(),
  recipeCounts: z
    .object({
      'eg-task-prefix-v1': z.number().int().nonnegative(),
      'unprompted-v0': z.number().int().nonnegative(),
    })
    .strict(),
  reproducibility: z
    .object({
      toleranceUlp: z.literal(FP16_NUMERIC_EXACT_MAX_ULP),
      digestExact: z.number().int().nonnegative(),
      numericExact: z.number().int().nonnegative(),
      semanticMatchOnly: z.literal(0),
    })
    .strict(),
  sourceLineageChecksum: Hex64,
  recipeEvidenceChecksum: Hex64,
  orderedCanonicalIdsChecksum: Hex64,
  /** Describes the runtime used for measurement only; never the historical model digest. */
  measurementRuntime: z
    .object({
      purpose: z.literal('REPRODUCIBILITY_MEASUREMENT_ONLY'),
      engine: z.string().min(1),
      modelAlias: z.string().min(1),
      currentRuntimeArtifactDigest: Hex64,
    })
    .strict(),
  dimension: z.literal(768),
  scalarType: z.literal('fp16'),
  knownHistoricalDefects: z.array(z.enum(['WRITE_FLAG_CONTRADICTS_REPORTED_UPDATE_COUNT'])).optional(),
};

const BodySchema = z.object(CanaryEvidenceBodyShape).strict();
export type SemanticSnapshotReproducibilityCanaryBodyV1 = z.infer<typeof BodySchema>;

export function deriveCanaryEvidenceId(body: SemanticSnapshotReproducibilityCanaryBodyV1): string {
  return `canary-evidence:${canonicalSha256V1(body)}`;
}

export const SemanticSnapshotReproducibilityCanaryEvidenceV1Schema = z
  .object({ ...CanaryEvidenceBodyShape, evidenceId: z.string().min(1) })
  .strict()
  .superRefine((value, ctx) => {
    const { evidenceId, ...body } = value;
    const recipeTotal = value.recipeCounts['eg-task-prefix-v1'] + value.recipeCounts['unprompted-v0'];
    const reproTotal = value.reproducibility.digestExact + value.reproducibility.numericExact;
    if (recipeTotal !== value.rowCount) {
      ctx.addIssue({ code: 'custom', path: ['recipeCounts'], message: 'recipe counts must sum to rowCount' });
    }
    if (reproTotal !== value.rowCount) {
      ctx.addIssue({ code: 'custom', path: ['reproducibility'], message: 'digest+numeric exact must equal rowCount' });
    }
    if (evidenceId !== deriveCanaryEvidenceId(body as SemanticSnapshotReproducibilityCanaryBodyV1)) {
      ctx.addIssue({ code: 'custom', path: ['evidenceId'], message: 'evidenceId must equal the derived body hash' });
    }
  });
export type SemanticSnapshotReproducibilityCanaryEvidenceV1 = z.infer<
  typeof SemanticSnapshotReproducibilityCanaryEvidenceV1Schema
>;

export function buildSemanticSnapshotReproducibilityCanaryEvidenceV1(
  input: z.input<typeof BodySchema>,
): SemanticSnapshotReproducibilityCanaryEvidenceV1 {
  const body = BodySchema.parse(input);
  return SemanticSnapshotReproducibilityCanaryEvidenceV1Schema.parse({ ...body, evidenceId: deriveCanaryEvidenceId(body) });
}
