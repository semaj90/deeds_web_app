import { createHash } from 'node:crypto';
import { z } from 'zod';

export const StructuralParityCorpusInterpretationStatusV1Schema = z.enum([
  'RUNTIME_BLOCKED',
  'BYTE_COORDINATE_BLOCKER',
  'SYMBOL_COVERAGE_BLOCKER',
  'SEMANTIC_KIND_BLOCKER',
  'SPAN_POLICY_DIFFERENCE',
  'CORPUS_PARITY_PROVEN',
]);

export type StructuralParityCorpusInterpretationStatusV1 = z.infer<typeof StructuralParityCorpusInterpretationStatusV1Schema>;

const GateRatioSchema = z.string().regex(/^\d+\/\d+$/);

export const StructuralParitySpanCompatibilityV1Schema = z.object({
  schema: z.literal('atlas.structural-span-compatibility.v1'),
  comparedPairCount: z.number().int().nonnegative(),
  exactPairCount: z.number().int().nonnegative(),
  medianAbsStartDeltaBytes: z.number().nonnegative().nullable(),
  medianAbsEndDeltaBytes: z.number().nonnegative().nullable(),
  medianSpanIoU: z.number().min(0).max(1).nullable(),
  minimumSpanIoU: z.number().min(0).max(1).nullable(),
  leftContainsRightCount: z.number().int().nonnegative(),
  rightContainsLeftCount: z.number().int().nonnegative(),
  compatibleOnlyAfterSemanticGates: z.literal(true),
}).strict();

export type StructuralParitySpanCompatibilityV1 = z.infer<typeof StructuralParitySpanCompatibilityV1Schema>;

export const StructuralParityCorpusInterpretationV1Schema = z.object({
  schema: z.literal('atlas.structural-parity-corpus-interpretation.v1'),
  sourceReceiptSchema: z.literal('atlas.node-tree-sitter-corpus-parity.v2'),
  sourceStatus: z.enum(['BLOCKED_RUNTIME_UNAVAILABLE', 'CORPUS_PARITY_MISMATCH', 'CORPUS_PARITY_PROVEN']),
  status: StructuralParityCorpusInterpretationStatusV1Schema,
  gates: z.object({
    runtimeAvailable: GateRatioSchema,
    sourceBytesFrozen: GateRatioSchema,
    nodeSpanSelfValid: GateRatioSchema,
    sidecarSpanSelfValid: GateRatioSchema,
    namedSymbolCoverage: GateRatioSchema,
    semanticKindParity: GateRatioSchema,
    exactSpanParity: GateRatioSchema,
    fullParity: GateRatioSchema,
  }).strict(),
  dominantMismatchClass: z.string().min(1).nullable(),
  spanCompatibility: StructuralParitySpanCompatibilityV1Schema.nullable(),
  structuralPromotionReviewEligible: z.boolean(),
  canonicalOwnerChanged: z.literal(false),
  chunkBoundaryPolicyChanged: z.literal(false),
  interpretationChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type StructuralParityCorpusInterpretationV1 = z.infer<typeof StructuralParityCorpusInterpretationV1Schema>;

type RawPair = {
  exactSpanMatch?: boolean;
  startByteDelta?: number;
  endByteDelta?: number;
  left?: { startByte?: number; endByte?: number };
  right?: { startByte?: number; endByte?: number };
};

type RawReceipt = {
  schema?: string;
  status?: string;
  gates?: Record<string, string>;
  mismatchCounts?: Record<string, number>;
  files?: Array<{ comparison?: { pairs?: RawPair[] } }>;
};

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function gatePassed(value: string): boolean {
  const [passed, total] = value.split('/').map(Number);
  return Number.isInteger(passed) && Number.isInteger(total) && total > 0 && passed === total;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function spanIou(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): number {
  const intersection = Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart));
  const union = Math.max(leftEnd, rightEnd) - Math.min(leftStart, rightStart);
  return union > 0 ? intersection / union : 0;
}

function dominantMismatch(mismatchCounts: Record<string, number>): string | null {
  const entries = Object.entries(mismatchCounts)
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort(([aKey, aCount], [bKey, bCount]) => bCount - aCount || aKey.localeCompare(bKey));
  return entries[0]?.[0] ?? null;
}

function computeSpanCompatibility(receipt: RawReceipt): StructuralParitySpanCompatibilityV1 {
  const pairs = (receipt.files ?? []).flatMap((file) => file.comparison?.pairs ?? []);
  const valid = pairs.filter((pair) =>
    Number.isFinite(pair.left?.startByte) &&
    Number.isFinite(pair.left?.endByte) &&
    Number.isFinite(pair.right?.startByte) &&
    Number.isFinite(pair.right?.endByte),
  );

  const startDeltas: number[] = [];
  const endDeltas: number[] = [];
  const ious: number[] = [];
  let exactPairCount = 0;
  let leftContainsRightCount = 0;
  let rightContainsLeftCount = 0;

  for (const pair of valid) {
    const leftStart = pair.left!.startByte!;
    const leftEnd = pair.left!.endByte!;
    const rightStart = pair.right!.startByte!;
    const rightEnd = pair.right!.endByte!;
    const startDelta = Number.isFinite(pair.startByteDelta) ? pair.startByteDelta! : rightStart - leftStart;
    const endDelta = Number.isFinite(pair.endByteDelta) ? pair.endByteDelta! : rightEnd - leftEnd;
    startDeltas.push(Math.abs(startDelta));
    endDeltas.push(Math.abs(endDelta));
    ious.push(spanIou(leftStart, leftEnd, rightStart, rightEnd));
    if (pair.exactSpanMatch === true || (leftStart === rightStart && leftEnd === rightEnd)) exactPairCount += 1;
    if (leftStart <= rightStart && leftEnd >= rightEnd) leftContainsRightCount += 1;
    if (rightStart <= leftStart && rightEnd >= leftEnd) rightContainsLeftCount += 1;
  }

  return StructuralParitySpanCompatibilityV1Schema.parse({
    schema: 'atlas.structural-span-compatibility.v1',
    comparedPairCount: valid.length,
    exactPairCount,
    medianAbsStartDeltaBytes: median(startDeltas),
    medianAbsEndDeltaBytes: median(endDeltas),
    medianSpanIoU: median(ious),
    minimumSpanIoU: ious.length ? Math.min(...ious) : null,
    leftContainsRightCount,
    rightContainsLeftCount,
    compatibleOnlyAfterSemanticGates: true,
  });
}

/**
 * Interpret an existing corpus-parity-v2 receipt without altering any provider,
 * matcher, parity gate, or canonical owner.
 *
 * Ordering is intentionally fail-closed:
 * runtime -> source/byte/span self-validity -> symbol coverage -> semantic kind
 * -> exact-span policy. Span compatibility statistics are emitted only when all
 * upstream structural gates are already green.
 */
export function interpretStructuralParityCorpusV1(raw: RawReceipt): StructuralParityCorpusInterpretationV1 {
  if (raw.schema !== 'atlas.node-tree-sitter-corpus-parity.v2') {
    throw new Error('UNSUPPORTED_CORPUS_PARITY_RECEIPT');
  }
  if (!['BLOCKED_RUNTIME_UNAVAILABLE', 'CORPUS_PARITY_MISMATCH', 'CORPUS_PARITY_PROVEN'].includes(String(raw.status))) {
    throw new Error('INVALID_CORPUS_PARITY_STATUS');
  }

  const gates = {
    runtimeAvailable: String(raw.gates?.runtimeAvailable ?? ''),
    sourceBytesFrozen: String(raw.gates?.sourceBytesFrozen ?? ''),
    nodeSpanSelfValid: String(raw.gates?.nodeSpanSelfValid ?? ''),
    sidecarSpanSelfValid: String(raw.gates?.sidecarSpanSelfValid ?? ''),
    namedSymbolCoverage: String(raw.gates?.namedSymbolCoverage ?? ''),
    semanticKindParity: String(raw.gates?.semanticKindParity ?? ''),
    exactSpanParity: String(raw.gates?.exactSpanParity ?? ''),
    fullParity: String(raw.gates?.fullParity ?? ''),
  };
  StructuralParityCorpusInterpretationV1Schema.shape.gates.parse(gates);

  const mismatchCounts = raw.mismatchCounts ?? {};
  let status: StructuralParityCorpusInterpretationStatusV1;
  let spanCompatibility: StructuralParitySpanCompatibilityV1 | null = null;
  let structuralPromotionReviewEligible = false;

  if (raw.status === 'BLOCKED_RUNTIME_UNAVAILABLE' || !gatePassed(gates.runtimeAvailable)) {
    status = 'RUNTIME_BLOCKED';
  } else if (
    !gatePassed(gates.sourceBytesFrozen) ||
    !gatePassed(gates.nodeSpanSelfValid) ||
    !gatePassed(gates.sidecarSpanSelfValid)
  ) {
    status = 'BYTE_COORDINATE_BLOCKER';
  } else if (!gatePassed(gates.namedSymbolCoverage)) {
    status = 'SYMBOL_COVERAGE_BLOCKER';
  } else if (!gatePassed(gates.semanticKindParity)) {
    status = 'SEMANTIC_KIND_BLOCKER';
  } else if (!gatePassed(gates.exactSpanParity)) {
    status = 'SPAN_POLICY_DIFFERENCE';
    spanCompatibility = computeSpanCompatibility(raw);
    structuralPromotionReviewEligible = true;
  } else {
    status = 'CORPUS_PARITY_PROVEN';
    spanCompatibility = computeSpanCompatibility(raw);
    structuralPromotionReviewEligible = true;
  }

  const payload = {
    schema: 'atlas.structural-parity-corpus-interpretation.v1' as const,
    sourceReceiptSchema: 'atlas.node-tree-sitter-corpus-parity.v2' as const,
    sourceStatus: raw.status as 'BLOCKED_RUNTIME_UNAVAILABLE' | 'CORPUS_PARITY_MISMATCH' | 'CORPUS_PARITY_PROVEN',
    status,
    gates,
    dominantMismatchClass: dominantMismatch(mismatchCounts),
    spanCompatibility,
    structuralPromotionReviewEligible,
    canonicalOwnerChanged: false as const,
    chunkBoundaryPolicyChanged: false as const,
  };

  return StructuralParityCorpusInterpretationV1Schema.parse({
    ...payload,
    interpretationChecksum: hash(canonicalJson({ ...payload, mismatchCounts })),
  });
}
