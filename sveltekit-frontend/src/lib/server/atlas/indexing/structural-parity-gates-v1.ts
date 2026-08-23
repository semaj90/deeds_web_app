import { z } from 'zod';
import type { StructuralParityComparisonV2 } from './structural-parity-comparator-v2.js';

const GateStatusSchema = z.enum(['PROVEN', 'MISMATCH', 'BLOCKED']);

export const StructuralObservationParityV1Schema = z.object({
  schema: z.literal('atlas.structural-observation-parity.v1'),
  sourceBytesFrozen: z.boolean(),
  leftSpanSelfValid: z.boolean(),
  rightSpanSelfValid: z.boolean(),
  namedSymbolCoverage: z.boolean(),
  semanticKindParity: z.boolean(),
  status: GateStatusSchema,
  promotionEligible: z.boolean(),
}).strict();
export type StructuralObservationParityV1 = z.infer<typeof StructuralObservationParityV1Schema>;

export const ChunkBoundaryParityV1Schema = z.object({
  schema: z.literal('atlas.chunk-boundary-parity.v1'),
  pairedCount: z.number().int().nonnegative(),
  exactSpanMatchCount: z.number().int().nonnegative(),
  exactSpanParity: z.boolean(),
  medianStartDeltaBytes: z.number().nonnegative(),
  medianEndDeltaBytes: z.number().nonnegative(),
  medianSpanIou: z.number().min(0).max(1),
  status: GateStatusSchema,
}).strict();
export type ChunkBoundaryParityV1 = z.infer<typeof ChunkBoundaryParityV1Schema>;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function spanIou(pair: StructuralParityComparisonV2['pairs'][number]): number {
  const leftStart = pair.left.startByte;
  const leftEnd = pair.left.endByte;
  const rightStart = pair.right.startByte;
  const rightEnd = pair.right.endByte;
  const intersection = Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart));
  const leftLength = Math.max(0, leftEnd - leftStart);
  const rightLength = Math.max(0, rightEnd - rightStart);
  const union = leftLength + rightLength - intersection;
  return union === 0 ? 1 : intersection / union;
}

export function deriveStructuralObservationParityV1(
  comparison: StructuralParityComparisonV2,
  sourceBytesFrozen: boolean,
): StructuralObservationParityV1 {
  const gates = comparison.gates;
  const promotionEligible = sourceBytesFrozen && gates.leftSpanSelfValid && gates.rightSpanSelfValid
    && gates.namedSymbolCoverage && gates.semanticKindParity;
  return StructuralObservationParityV1Schema.parse({
    schema: 'atlas.structural-observation-parity.v1', sourceBytesFrozen,
    leftSpanSelfValid: gates.leftSpanSelfValid, rightSpanSelfValid: gates.rightSpanSelfValid,
    namedSymbolCoverage: gates.namedSymbolCoverage, semanticKindParity: gates.semanticKindParity,
    status: promotionEligible ? 'PROVEN' : sourceBytesFrozen ? 'MISMATCH' : 'BLOCKED',
    promotionEligible,
  });
}

export function deriveChunkBoundaryParityV1(
  comparison: StructuralParityComparisonV2,
): ChunkBoundaryParityV1 {
  const pairs = comparison.pairs;
  const exactSpanMatchCount = pairs.filter((pair) => pair.exactSpanMatch).length;
  const exactSpanParity = comparison.gates.exactSpanParity;
  return ChunkBoundaryParityV1Schema.parse({
    schema: 'atlas.chunk-boundary-parity.v1', pairedCount: pairs.length, exactSpanMatchCount,
    exactSpanParity, medianStartDeltaBytes: median(pairs.map((pair) => Math.abs(pair.startByteDelta))),
    medianEndDeltaBytes: median(pairs.map((pair) => Math.abs(pair.endByteDelta))),
    medianSpanIou: median(pairs.map(spanIou)), status: exactSpanParity ? 'PROVEN' : 'MISMATCH',
  });
}
