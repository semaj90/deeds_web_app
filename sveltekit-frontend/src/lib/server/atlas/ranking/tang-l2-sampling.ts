import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  MeasuredTangPolicyReceiptV1Schema,
  stableReceiptSha256,
  type MeasuredTangPolicyReceiptV1,
} from './measured-matrix-diagnostics.js';

/**
 * Replayable implementation of the l2 row-sampling primitive used by the
 * Tang/quantum-inspired input model.
 *
 * IMPORTANT: this is NOT the full Tang recommendation algorithm, ModFKV, or
 * the later rejection-sampling stages. It executes only the matrix-row sampling
 * primitive already represented by the N×16 row squared-norm probabilities.
 */

export const TangL2SamplingModeSchema = z.literal('L2_ROW_NORM_SQUARED_WITH_REPLACEMENT');
export const TangSamplingPrngSchema = z.literal('SPLITMIX64_U53_V1');

export const TangL2SamplingDrawV1Schema = z.object({
  ordinal: z.number().int().nonnegative(),
  random53: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  unitInterval: z.number().finite().min(0).max(1),
  rowIndex: z.number().int().nonnegative(),
  packetKey: z.string().min(1),
  squaredNorm: z.number().finite().nonnegative(),
  samplingProbability: z.number().finite().min(0).max(1),
}).strict();
export type TangL2SamplingDrawV1 = z.infer<typeof TangL2SamplingDrawV1Schema>;

export const TangL2SamplingReceiptV1Schema = z.object({
  schema: z.literal('atlas.tang-l2-sampling-receipt.v1'),
  requestId: z.string().min(1),
  matrixSha256: z.string().regex(/^[a-f0-9]{64}$/),
  tangPolicyReceiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  samplingMode: TangL2SamplingModeSchema,
  prng: TangSamplingPrngSchema,
  seedHex: z.string().regex(/^0x[a-f0-9]{16}$/),
  seedSource: z.enum(['DERIVED_FROM_RECEIPT_LINEAGE', 'EXPLICIT_REPLAY_SEED']),
  drawCount: z.number().int().positive().max(4096),
  probabilityMassSum: z.number().finite().positive(),
  draws: z.array(TangL2SamplingDrawV1Schema).min(1).max(4096),
  selectedPacketKeys: z.array(z.string().min(1)).min(1),
  duplicateDrawCount: z.number().int().nonnegative(),
  sampledWithReplacement: z.literal(true),
  deterministicReplaySupported: z.literal(true),
  l2SamplingPrimitiveExecuted: z.literal(true),
  fullTangAlgorithmExecuted: z.literal(false),
  modFkvExecuted: z.literal(false),
  rejectionSamplingExecuted: z.literal(false),
  proposalOnly: z.literal(true),
  canonicalWritesAllowed: z.literal(false),
  replaySha256: z.string().regex(/^[a-f0-9]{64}$/),
  producerRevision: z.string().min(1),
}).strict();
export type TangL2SamplingReceiptV1 = z.infer<typeof TangL2SamplingReceiptV1Schema>;

const MASK_64 = (1n << 64n) - 1n;
const TWO_POW_53 = 9_007_199_254_740_992;

function uint64(value: bigint): bigint {
  return value & MASK_64;
}

function parseSeed(seedHex: string): bigint {
  if (!/^0x[a-f0-9]{16}$/.test(seedHex)) throw new Error('TANG_SAMPLING_INVALID_SEED_HEX');
  return BigInt(seedHex);
}

function deriveSeed(input: { requestId: string; matrixSha256: string; tangPolicyReceiptSha256: string }): string {
  const digest = createHash('sha256')
    .update(input.requestId)
    .update('\0')
    .update(input.matrixSha256)
    .update('\0')
    .update(input.tangPolicyReceiptSha256)
    .digest('hex');
  return `0x${digest.slice(0, 16)}`;
}

function splitMix64Next(state: bigint): { state: bigint; value: bigint } {
  const nextState = uint64(state + 0x9E3779B97F4A7C15n);
  let z = nextState;
  z = uint64((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n);
  z = uint64((z ^ (z >> 27n)) * 0x94D049BB133111EBn);
  z = uint64(z ^ (z >> 31n));
  return { state: nextState, value: z };
}

function random53(value: bigint): number {
  return Number(value >> 11n);
}

function uniqueInEncounterOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function replayHash(value: Omit<TangL2SamplingReceiptV1, 'replaySha256'>): string {
  return stableReceiptSha256(value);
}

function chooseRow(cdf: readonly number[], unitInterval: number): number {
  let lo = 0;
  let hi = cdf.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (unitInterval < cdf[mid]) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function executeTangL2Sampling(input: {
  tangPolicy: MeasuredTangPolicyReceiptV1;
  drawCount?: number;
  seedHex?: string;
  producerRevision: string;
}): TangL2SamplingReceiptV1 {
  const tang = MeasuredTangPolicyReceiptV1Schema.parse(input.tangPolicy);
  if (!tang.qualified || tang.recommendation.status !== 'ELIGIBLE') {
    throw new Error('TANG_L2_SAMPLING_REQUIRES_QUALIFIED_POLICY');
  }
  if (!tang.recommendation.rows.length) throw new Error('TANG_L2_SAMPLING_REQUIRES_ROWS');

  const rows = tang.recommendation.rows;
  const probabilityMassSum = rows.reduce((sum, row) => sum + row.samplingProbability, 0);
  if (!(probabilityMassSum > 0) || Math.abs(probabilityMassSum - 1) > 1e-9) {
    throw new Error(`TANG_L2_SAMPLING_PROBABILITY_MASS_INVALID:${probabilityMassSum}`);
  }

  const drawCount = Math.min(
    4096,
    Math.max(1, input.drawCount ?? tang.policy.promotionCount),
  );
  const tangPolicyReceiptSha256 = stableReceiptSha256(tang);
  const seedHex = input.seedHex?.toLowerCase() ?? deriveSeed({
    requestId: tang.requestId,
    matrixSha256: tang.matrixSha256,
    tangPolicyReceiptSha256,
  });
  const seedSource = input.seedHex ? 'EXPLICIT_REPLAY_SEED' : 'DERIVED_FROM_RECEIPT_LINEAGE';
  let state = parseSeed(seedHex);

  const cdf: number[] = [];
  let cumulative = 0;
  for (const row of rows) {
    cumulative += row.samplingProbability;
    cdf.push(cumulative);
  }
  cdf[cdf.length - 1] = 1;

  const draws: TangL2SamplingDrawV1[] = [];
  for (let ordinal = 0; ordinal < drawCount; ordinal += 1) {
    const next = splitMix64Next(state);
    state = next.state;
    const r53 = random53(next.value);
    const unitInterval = r53 / TWO_POW_53;
    const rowIndex = chooseRow(cdf, unitInterval);
    const row = rows[rowIndex];
    draws.push(TangL2SamplingDrawV1Schema.parse({
      ordinal,
      random53: r53,
      unitInterval,
      rowIndex,
      packetKey: row.packetKey,
      squaredNorm: row.squaredNorm,
      samplingProbability: row.samplingProbability,
    }));
  }

  const selectedPacketKeys = uniqueInEncounterOrder(draws.map((draw) => draw.packetKey));
  const withoutHash = {
    schema: 'atlas.tang-l2-sampling-receipt.v1' as const,
    requestId: tang.requestId,
    matrixSha256: tang.matrixSha256,
    tangPolicyReceiptSha256,
    samplingMode: 'L2_ROW_NORM_SQUARED_WITH_REPLACEMENT' as const,
    prng: 'SPLITMIX64_U53_V1' as const,
    seedHex,
    seedSource,
    drawCount,
    probabilityMassSum,
    draws,
    selectedPacketKeys,
    duplicateDrawCount: drawCount - selectedPacketKeys.length,
    sampledWithReplacement: true as const,
    deterministicReplaySupported: true as const,
    l2SamplingPrimitiveExecuted: true as const,
    fullTangAlgorithmExecuted: false as const,
    modFkvExecuted: false as const,
    rejectionSamplingExecuted: false as const,
    proposalOnly: true as const,
    canonicalWritesAllowed: false as const,
    producerRevision: input.producerRevision,
  };

  return TangL2SamplingReceiptV1Schema.parse({
    ...withoutHash,
    replaySha256: replayHash(withoutHash),
  });
}

export function replayTangL2Sampling(
  tangPolicy: MeasuredTangPolicyReceiptV1,
  receiptValue: TangL2SamplingReceiptV1,
  producerRevision = 'tang-l2-sampling-replay.v1',
): TangL2SamplingReceiptV1 {
  const receipt = TangL2SamplingReceiptV1Schema.parse(receiptValue);
  const replayed = executeTangL2Sampling({
    tangPolicy,
    drawCount: receipt.drawCount,
    seedHex: receipt.seedHex,
    producerRevision,
  });

  const comparable = {
    requestId: replayed.requestId,
    matrixSha256: replayed.matrixSha256,
    tangPolicyReceiptSha256: replayed.tangPolicyReceiptSha256,
    samplingMode: replayed.samplingMode,
    prng: replayed.prng,
    seedHex: replayed.seedHex,
    drawCount: replayed.drawCount,
    draws: replayed.draws,
    selectedPacketKeys: replayed.selectedPacketKeys,
    duplicateDrawCount: replayed.duplicateDrawCount,
  };
  const originalComparable = {
    requestId: receipt.requestId,
    matrixSha256: receipt.matrixSha256,
    tangPolicyReceiptSha256: receipt.tangPolicyReceiptSha256,
    samplingMode: receipt.samplingMode,
    prng: receipt.prng,
    seedHex: receipt.seedHex,
    drawCount: receipt.drawCount,
    draws: receipt.draws,
    selectedPacketKeys: receipt.selectedPacketKeys,
    duplicateDrawCount: receipt.duplicateDrawCount,
  };
  if (stableReceiptSha256(comparable) !== stableReceiptSha256(originalComparable)) {
    throw new Error('TANG_L2_SAMPLING_REPLAY_MISMATCH');
  }
  return replayed;
}
