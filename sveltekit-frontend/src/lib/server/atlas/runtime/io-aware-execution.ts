import { z } from 'zod';

export const AtlasRuleOfThreePhaseSchema = z.enum(['MOVE', 'COMPUTE', 'COMPACT']);
export type AtlasRuleOfThreePhase = z.infer<typeof AtlasRuleOfThreePhaseSchema>;

/**
 * Parent Atlas design mnemonic inspired by IO-aware kernels:
 * MOVE -> COMPUTE -> COMPACT.
 * This is an Atlas scheduling rule, not a mathematical law.
 */
export const AtlasRuleOfThreeV1Schema = z.object({
  schema: z.literal('atlas.rule-of-three.v1'),
  phases: z.tuple([
    z.literal('MOVE'),
    z.literal('COMPUTE'),
    z.literal('COMPACT'),
  ]),
  producerRevision: z.string().min(1),
}).strict();
export type AtlasRuleOfThreeV1 = z.infer<typeof AtlasRuleOfThreeV1Schema>;

export const TileTraversalSchema = z.enum([
  'ROW_MAJOR',
  'COLUMN_MAJOR',
  'SERPENTINE',
  'HILBERT_2D',
]);
export type TileTraversal = z.infer<typeof TileTraversalSchema>;

export const TileSchedulerV1Schema = z.object({
  schema: z.literal('atlas.tile-scheduler.v1'),
  inputCount: z.number().int().nonnegative(),
  rowBytes: z.number().int().positive(),
  requestedTileRows: z.number().int().positive(),
  tileRows: z.number().int().positive(),
  tileBytes: z.number().int().positive(),
  availableVramBytes: z.number().int().nonnegative(),
  reserveVramBytes: z.number().int().nonnegative(),
  usableVramBytes: z.number().int().nonnegative(),
  workingSetMultiplier: z.number().finite().min(1),
  prefetchDepth: z.number().int().min(1).max(16),
  traversal: TileTraversalSchema,
  tileCount: z.number().int().nonnegative(),
  exactSemanticsPreserved: z.boolean(),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.reserveVramBytes > value.availableVramBytes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reserveVramBytes'], message: 'reserve VRAM cannot exceed available VRAM' });
  }
  if (value.usableVramBytes !== value.availableVramBytes - value.reserveVramBytes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['usableVramBytes'], message: 'usable VRAM must equal available minus reserve' });
  }
  if (value.tileBytes !== value.tileRows * value.rowBytes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tileBytes'], message: 'tileBytes must equal tileRows * rowBytes' });
  }
  if (value.tileCount !== (value.inputCount === 0 ? 0 : Math.ceil(value.inputCount / value.tileRows))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tileCount'], message: 'tileCount does not match inputCount/tileRows' });
  }
});
export type TileSchedulerV1 = z.infer<typeof TileSchedulerV1Schema>;

export function planTileScheduler(input: {
  inputCount: number;
  rowBytes: number;
  requestedTileRows: number;
  availableVramBytes: number;
  reserveVramBytes: number;
  workingSetMultiplier?: number;
  prefetchDepth?: number;
  traversal?: TileTraversal;
  exactSemanticsPreserved?: boolean;
  producerRevision: string;
}): TileSchedulerV1 {
  if (!Number.isInteger(input.inputCount) || input.inputCount < 0) throw new Error('inputCount must be a non-negative integer');
  if (!Number.isInteger(input.rowBytes) || input.rowBytes <= 0) throw new Error('rowBytes must be a positive integer');
  if (!Number.isInteger(input.requestedTileRows) || input.requestedTileRows <= 0) throw new Error('requestedTileRows must be positive');
  if (!Number.isInteger(input.availableVramBytes) || input.availableVramBytes < 0) throw new Error('availableVramBytes must be non-negative');
  if (!Number.isInteger(input.reserveVramBytes) || input.reserveVramBytes < 0) throw new Error('reserveVramBytes must be non-negative');
  if (input.reserveVramBytes > input.availableVramBytes) throw new Error('reserve VRAM cannot exceed available VRAM');

  const multiplier = input.workingSetMultiplier ?? 1;
  if (!Number.isFinite(multiplier) || multiplier < 1) throw new Error('workingSetMultiplier must be >= 1');
  const prefetchDepth = Math.max(1, Math.min(16, input.prefetchDepth ?? 1));
  const usableVramBytes = input.availableVramBytes - input.reserveVramBytes;
  const bytesPerResidentRow = input.rowBytes * multiplier * prefetchDepth;
  const capacityRows = Math.floor(usableVramBytes / Math.max(1, bytesPerResidentRow));
  if (input.inputCount > 0 && capacityRows < 1) throw new Error('VRAM envelope cannot fit one resident row with the requested working set');

  const tileRows = input.inputCount === 0
    ? 1
    : Math.max(1, Math.min(input.requestedTileRows, capacityRows, input.inputCount));

  return TileSchedulerV1Schema.parse({
    schema: 'atlas.tile-scheduler.v1',
    inputCount: input.inputCount,
    rowBytes: input.rowBytes,
    requestedTileRows: input.requestedTileRows,
    tileRows,
    tileBytes: tileRows * input.rowBytes,
    availableVramBytes: input.availableVramBytes,
    reserveVramBytes: input.reserveVramBytes,
    usableVramBytes,
    workingSetMultiplier: multiplier,
    prefetchDepth,
    traversal: input.traversal ?? 'ROW_MAJOR',
    tileCount: input.inputCount === 0 ? 0 : Math.ceil(input.inputCount / tileRows),
    exactSemanticsPreserved: input.exactSemanticsPreserved ?? true,
    producerRevision: input.producerRevision,
  });
}

export type TileRangeV1 = {
  tileIndex: number;
  startRow: number;
  endRowExclusive: number;
  direction: 'FORWARD' | 'REVERSE';
};

/**
 * SERPENTINE changes traversal order only. It must never change candidate
 * identity, score semantics, or graph relation meaning.
 */
export function materializeTileRanges(plan: TileSchedulerV1): TileRangeV1[] {
  const parsed = TileSchedulerV1Schema.parse(plan);
  const ranges: TileRangeV1[] = [];
  for (let tileIndex = 0; tileIndex < parsed.tileCount; tileIndex += 1) {
    const startRow = tileIndex * parsed.tileRows;
    const endRowExclusive = Math.min(parsed.inputCount, startRow + parsed.tileRows);
    const reverse = parsed.traversal === 'SERPENTINE' && tileIndex % 2 === 1;
    ranges.push({ tileIndex, startRow, endRowExclusive, direction: reverse ? 'REVERSE' : 'FORWARD' });
  }
  return ranges;
}

export const StreamingTopKEntryV1Schema = z.object({
  canonicalId: z.string().min(1),
  score: z.number().finite(),
  ordinal: z.number().int().nonnegative(),
}).strict();
export type StreamingTopKEntryV1 = z.infer<typeof StreamingTopKEntryV1Schema>;

export const StreamingTopKStateV1Schema = z.object({
  schema: z.literal('atlas.streaming-topk-state.v1'),
  k: z.number().int().positive(),
  entries: z.array(StreamingTopKEntryV1Schema),
  currentCutoff: z.number().finite().nullable(),
  processedRows: z.number().int().nonnegative(),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.entries.length > value.k) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entries'], message: 'entries length cannot exceed k' });
  }
  const sorted = [...value.entries].sort(compareTopKEntries);
  if (sorted.some((entry, index) => entry.canonicalId !== value.entries[index]?.canonicalId || entry.score !== value.entries[index]?.score || entry.ordinal !== value.entries[index]?.ordinal)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entries'], message: 'entries must be in deterministic top-K order' });
  }
  const expectedCutoff = value.entries.length < value.k ? null : value.entries[value.entries.length - 1]?.score ?? null;
  if (value.currentCutoff !== expectedCutoff) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['currentCutoff'], message: 'currentCutoff must match the kth score once the state is full' });
  }
});
export type StreamingTopKStateV1 = z.infer<typeof StreamingTopKStateV1Schema>;

function compareTopKEntries(a: StreamingTopKEntryV1, b: StreamingTopKEntryV1): number {
  return b.score - a.score || a.canonicalId.localeCompare(b.canonicalId) || a.ordinal - b.ordinal;
}

export function createStreamingTopKState(k: number, producerRevision: string): StreamingTopKStateV1 {
  return StreamingTopKStateV1Schema.parse({
    schema: 'atlas.streaming-topk-state.v1',
    k,
    entries: [],
    currentCutoff: null,
    processedRows: 0,
    producerRevision,
  });
}

/** Merge one scored tile into the compact running top-K state. */
export function mergeStreamingTopK(
  state: StreamingTopKStateV1,
  tileEntries: readonly StreamingTopKEntryV1[],
  processedRowCount = tileEntries.length,
): StreamingTopKStateV1 {
  const parsed = StreamingTopKStateV1Schema.parse(state);
  if (!Number.isInteger(processedRowCount) || processedRowCount < 0) throw new Error('processedRowCount must be non-negative');

  const bestByIdentity = new Map<string, StreamingTopKEntryV1>();
  for (const entry of [...parsed.entries, ...tileEntries.map((entry) => StreamingTopKEntryV1Schema.parse(entry))]) {
    const key = `${entry.canonicalId}\0${entry.ordinal}`;
    const previous = bestByIdentity.get(key);
    if (!previous || compareTopKEntries(entry, previous) < 0) bestByIdentity.set(key, entry);
  }
  const entries = [...bestByIdentity.values()].sort(compareTopKEntries).slice(0, parsed.k);
  return StreamingTopKStateV1Schema.parse({
    ...parsed,
    entries,
    currentCutoff: entries.length < parsed.k ? null : entries[entries.length - 1]?.score ?? null,
    processedRows: parsed.processedRows + processedRowCount,
  });
}

export const ResidencyTierSchema = z.enum([
  'VRAM',
  'PINNED_RAM',
  'HOST_RAM',
  'VALKEY',
  'QDRANT',
  'POSTGRES',
  'DISK',
]);
export type ResidencyTier = z.infer<typeof ResidencyTierSchema>;

export const ResidencyRangeV1Schema = z.object({
  representationId: z.string().min(1),
  representationRevision: z.string().min(1),
  ordinalStart: z.number().int().nonnegative(),
  ordinalEndExclusive: z.number().int().positive(),
  tier: ResidencyTierSchema,
  byteLength: z.number().int().nonnegative(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  artifactRef: z.string().min(1).nullable(),
  mutable: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.ordinalEndExclusive <= value.ordinalStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ordinalEndExclusive'], message: 'ordinal range must be non-empty' });
  }
  if ((value.tier === 'VALKEY' || value.tier === 'DISK') && value.checksumSha256 === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['checksumSha256'], message: 'persistent/cached residency requires checksum' });
  }
});
export type ResidencyRangeV1 = z.infer<typeof ResidencyRangeV1Schema>;

export const ResidencyTableV1Schema = z.object({
  schema: z.literal('atlas.residency-table.v1'),
  workspaceRevision: z.string().min(1),
  entries: z.array(ResidencyRangeV1Schema).max(1_000_000),
  producerRevision: z.string().min(1),
}).strict();
export type ResidencyTableV1 = z.infer<typeof ResidencyTableV1Schema>;

export function findResidency(
  table: ResidencyTableV1,
  representationId: string,
  representationRevision: string,
  ordinal: number,
): ResidencyRangeV1[] {
  const parsed = ResidencyTableV1Schema.parse(table);
  return parsed.entries
    .filter((entry) =>
      entry.representationId === representationId
      && entry.representationRevision === representationRevision
      && ordinal >= entry.ordinalStart
      && ordinal < entry.ordinalEndExclusive)
    .sort((a, b) => residencyTierRank(a.tier) - residencyTierRank(b.tier));
}

function residencyTierRank(tier: ResidencyTier): number {
  switch (tier) {
    case 'VRAM': return 0;
    case 'PINNED_RAM': return 1;
    case 'HOST_RAM': return 2;
    case 'VALKEY': return 3;
    case 'QDRANT': return 4;
    case 'POSTGRES': return 5;
    case 'DISK': return 6;
  }
}

export const SearchPartitionPolicyV1Schema = z.object({
  schema: z.literal('atlas.search-partition-policy.v1'),
  policy: z.enum([
    'FIXED_TOPK',
    'BEAM',
    'TERNARY_UNIMODAL_1D',
    'GOLDEN_SECTION_UNIMODAL_1D',
    'FIBONACCI_UNIMODAL_1D',
  ]),
  domainKind: z.enum(['GRAPH', 'ORDERED_DISCRETE_1D', 'CONTINUOUS_1D']),
  branchOrBeamWidth: z.number().int().positive().nullable(),
  goldenRatio: z.literal(1.618033988749895).nullable(),
  canClaimGraphOptimality: z.boolean(),
  notes: z.array(z.string().min(1)).max(8),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  const golden = value.policy === 'GOLDEN_SECTION_UNIMODAL_1D' || value.policy === 'FIBONACCI_UNIMODAL_1D';
  if (golden && value.domainKind === 'GRAPH') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['domainKind'], message: 'golden/Fibonacci interval search is not a generic graph-search branching law' });
  }
  if (value.policy === 'BEAM' && value.domainKind !== 'GRAPH') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['domainKind'], message: 'BEAM policy is reserved here for bounded graph/context fanout' });
  }
});
export type SearchPartitionPolicyV1 = z.infer<typeof SearchPartitionPolicyV1Schema>;

export function atlasRuleOfThree(producerRevision: string): AtlasRuleOfThreeV1 {
  return AtlasRuleOfThreeV1Schema.parse({
    schema: 'atlas.rule-of-three.v1',
    phases: ['MOVE', 'COMPUTE', 'COMPACT'],
    producerRevision,
  });
}
