import { createHash } from 'node:crypto';
import { z } from 'zod';

export const CANONICAL_CANDIDATE_SCHEMA = 'atlas.canonical-candidate.v1' as const;
export const CANDIDATE_ORDINAL_MAP_SCHEMA = 'atlas.candidate-ordinal-map.v1' as const;

const candidateRepresentationId = z.enum([
  'semantic_768',
  'semantic_mrl_512',
  'semantic_mrl_256',
  'semantic_mrl_128',
  'latent_256',
  'latent_128',
  'latent_64',
]);

const mrlDimensions: Record<string, number> = {
  semantic_768: 768,
  semantic_mrl_512: 512,
  semantic_mrl_256: 256,
  semantic_mrl_128: 128,
};
const latentDimensions: Record<string, number> = {
  latent_256: 256,
  latent_128: 128,
  latent_64: 64,
};

export const candidateRepresentationBindingV1Schema = z.object({
  representationId: candidateRepresentationId,
  family: z.enum(['EMBEDDINGGEMMA_MRL', 'LEARNED_LATENT']),
  dimensions: z.number().int().positive(),
  modelRevision: z.string().min(1),
  projectionKind: z.enum(['NONE', 'MRL_PREFIX_TRUNCATION', 'LEARNED_AUTOENCODER', 'NESTED_PREFIX_L2_RENORMALIZE']),
  sourceRepresentationId: candidateRepresentationId.nullable(),
  projectionRevision: z.string().min(1).nullable(),
  normalized: z.literal(true),
  available: z.boolean(),
  availabilityReason: z.string().min(1).nullable(),
}).strict().superRefine((binding, ctx) => {
  const expected = mrlDimensions[binding.representationId] ?? latentDimensions[binding.representationId];
  if (binding.dimensions !== expected) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dimensions'], message: 'REPRESENTATION_DIMENSION_MISMATCH' });
  }

  if (binding.representationId in mrlDimensions) {
    if (binding.family !== 'EMBEDDINGGEMMA_MRL') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['family'], message: 'MRL_FAMILY_MISMATCH' });
    }
    const isCanonical = binding.representationId === 'semantic_768';
    if (binding.projectionKind !== (isCanonical ? 'NONE' : 'MRL_PREFIX_TRUNCATION')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projectionKind'], message: 'MRL_PROJECTION_KIND_MISMATCH' });
    }
    if (binding.sourceRepresentationId !== (isCanonical ? null : 'semantic_768')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceRepresentationId'], message: 'MRL_SOURCE_MISMATCH' });
    }
    if (!isCanonical && binding.projectionRevision === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projectionRevision'], message: 'MRL_PROJECTION_REVISION_REQUIRED' });
    }
  }

  if (binding.representationId in latentDimensions) {
    if (binding.family !== 'LEARNED_LATENT') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['family'], message: 'LEARNED_LATENT_FAMILY_MISMATCH' });
    }
    // latent_256 and latent_64 are persisted learned outputs from semantic_768.
    // Only latent_128 is the virtual PREFIX_L2 view of latent_256.
    const isPhysicalLatent = binding.representationId !== 'latent_128';
    const expectedProjection = isPhysicalLatent ? 'LEARNED_AUTOENCODER' : 'NESTED_PREFIX_L2_RENORMALIZE';
    const expectedSource = isPhysicalLatent ? 'semantic_768' : 'latent_256';
    if (binding.projectionKind !== expectedProjection) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projectionKind'], message: 'LEARNED_LATENT_PROJECTION_KIND_MISMATCH' });
    }
    if (binding.sourceRepresentationId !== expectedSource) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceRepresentationId'], message: 'LEARNED_LATENT_SOURCE_MISMATCH' });
    }
    if (binding.projectionRevision === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projectionRevision'], message: 'LEARNED_LATENT_PROJECTION_REVISION_REQUIRED' });
    }
  }

  if (!binding.available && binding.availabilityReason === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['availabilityReason'], message: 'UNAVAILABLE_REPRESENTATION_REASON_REQUIRED' });
  }
});
export type CandidateRepresentationBindingV1 = z.infer<typeof candidateRepresentationBindingV1Schema>;

const revision = z.string().min(1);
const nullableId = z.string().min(1).nullable();

/**
 * Physical uint32 boundary for Arrow/GPU consumers. Zod's plain `int().nonnegative()` does not
 * prove uint32 compatibility on its own — JS's safe-integer range is far larger than 2^32-1.
 */
export const CANDIDATE_ORDINAL_MAX_UINT32 = 4_294_967_295;

const canonicalCandidateV1BaseSchema = z.object({
  schema: z.literal(CANONICAL_CANDIDATE_SCHEMA),
  candidateOrdinal: z.number().int().nonnegative().max(CANDIDATE_ORDINAL_MAX_UINT32),
  canonicalId: z.string().min(1),
  packetKey: nullableId,
  sourceRef: nullableId.default(null),
  treeNodeId: nullableId,
  symbolVersionId: nullableId,
  workspaceRevision: revision,
  sourceRevision: revision,
  graphRevision: revision.nullable(),
  semanticRevision: revision.nullable(),
  candidateSnapshotRevision: revision,
  degradedIdentity: z.boolean().default(false),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  representationBindings: z.array(candidateRepresentationBindingV1Schema).default([]),
}).strict();

/** Validate representation bindings as a candidate-level set, not only as isolated rows. */
export function assertRepresentationBindingSet(bindings: readonly CandidateRepresentationBindingV1[]): void {
  const parsed = bindings.map((binding) => candidateRepresentationBindingV1Schema.parse(binding));
  const byId = new Map(parsed.map((binding) => [binding.representationId, binding]));
  if (byId.size !== parsed.length) throw new Error('REPRESENTATION_BINDING_DUPLICATE_ID');
  for (const binding of parsed) {
    if (!binding.available) continue;
    const requiredSource = binding.sourceRepresentationId;
    if (requiredSource && !byId.get(requiredSource)?.available) {
      throw new Error(`REPRESENTATION_BINDING_SOURCE_UNAVAILABLE:${binding.representationId}:${requiredSource}`);
    }
  }
}

export const canonicalCandidateV1Schema = canonicalCandidateV1BaseSchema.superRefine((candidate, ctx) => {
  if (!candidate.degradedIdentity && candidate.packetKey === null && candidate.treeNodeId === null && candidate.symbolVersionId === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['degradedIdentity'],
      message: 'CANONICAL_CANDIDATE_STRONG_IDENTITY_REQUIRED',
    });
  }

  const bindings = new Map<string, (typeof candidate.representationBindings)[number]>();
  candidate.representationBindings.forEach((binding, index) => {
    if (bindings.has(binding.representationId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['representationBindings', index, 'representationId'],
        message: `CANDIDATE_REPRESENTATION_BINDING_DUPLICATE:${binding.representationId}`,
      });
      return;
    }
    bindings.set(binding.representationId, binding);
  });

  const requireAvailableSource = (representationId: string, sourceRepresentationId: string) => {
    const binding = bindings.get(representationId);
    if (!binding?.available) return;
    const source = bindings.get(sourceRepresentationId);
    if (!source?.available) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['representationBindings'],
        message: `AVAILABLE_REPRESENTATION_SOURCE_UNAVAILABLE:${representationId}:${sourceRepresentationId}`,
      });
    }
  };

  requireAvailableSource('semantic_mrl_512', 'semantic_768');
  requireAvailableSource('semantic_mrl_256', 'semantic_768');
  requireAvailableSource('semantic_mrl_128', 'semantic_768');
  requireAvailableSource('latent_256', 'semantic_768');
  requireAvailableSource('latent_128', 'latent_256');
  // latent_64 is a persisted sibling output of the same encoder pass, not a
  // virtual prefix of latent_256. Its direct source is semantic_768.
  requireAvailableSource('latent_64', 'semantic_768');
});
export type CanonicalCandidateV1 = z.infer<typeof canonicalCandidateV1Schema>;

export const candidateOrdinalMapV1Schema = z.object({
  schema: z.literal(CANDIDATE_ORDINAL_MAP_SCHEMA),
  candidateSnapshotRevision: revision,
  workspaceRevision: revision,
  rowCount: z.number().int().nonnegative(),
  candidates: z.array(canonicalCandidateV1Schema),
  ordinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  identityAuthority: z.literal(false),
  producerRevision: revision,
}).strict();
export type CandidateOrdinalMapV1 = z.infer<typeof candidateOrdinalMapV1Schema>;

const sha256Revision = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const openSpecTaskOrdinalRowV1Schema = z.object({
  candidateOrdinal: z.number().int().nonnegative().max(CANDIDATE_ORDINAL_MAX_UINT32),
  taskStableKey: z.string().min(1),
  taskRevision: z.string().min(1),
  sourcePath: z.string().min(1),
  sourceLine: z.number().int().positive(),
  sourceFileRevision: sha256Revision,
  workspaceRevision: z.string().min(1),
  taskCardChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  retrievalState: z.enum(['CURRENT', 'WAITING', 'REVIEW_REQUIRED']),
}).strict();
export type OpenSpecTaskOrdinalRowV1 = z.infer<typeof openSpecTaskOrdinalRowV1Schema>;

export const openSpecTaskOrdinalMapV1Schema = z.object({
  schema: z.literal('atlas.candidate-ordinal-map.v1'),
  universeKind: z.literal('OPENSPEC_TASKCARD'),
  workspaceRevision: z.string().min(1),
  taskUniverseRevision: sha256Revision,
  sourcePopulationChecksum: sha256Revision,
  candidateSnapshotRevision: sha256Revision,
  rowCount: z.number().int().nonnegative(),
  candidates: z.array(openSpecTaskOrdinalRowV1Schema),
  ordinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  identityAuthority: z.literal(false),
  canonicalAuthority: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type OpenSpecTaskOrdinalMapV1 = z.infer<typeof openSpecTaskOrdinalMapV1Schema>;

export const ordinalUniverseMapV1Schema = z.discriminatedUnion('universeKind', [
  z.object({ universeKind: z.literal('PACKET_CANDIDATE'), ordinalMap: candidateOrdinalMapV1Schema }).strict(),
  z.object({ universeKind: z.literal('OPENSPEC_TASKCARD'), ordinalMap: openSpecTaskOrdinalMapV1Schema }).strict(),
]);
export type OrdinalUniverseMapV1 = z.infer<typeof ordinalUniverseMapV1Schema>;

/**
 * Deterministic, locale-independent binary string comparator. `String.prototype.localeCompare()`
 * is ICU-driven and NOT guaranteed identical across Node builds (full-icu vs small-icu), default
 * locales, or ICU data versions — unacceptable for anything feeding a checksum meant to replay
 * identically across machines. UTF-8 byte comparison is deterministic on every platform/runtime.
 */
export function compareUtf8(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => compareUtf8(a, b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function candidateOrdinalMapChecksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function revisionFromCanonicalValue(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

export function materializeOpenSpecTaskOrdinalMapV1(input: {
  taskCards: readonly Record<string, unknown>[];
  taskFileHashes: Readonly<Record<string, string>>;
  workspaceRevision: string;
  sourcePopulationChecksum: string;
  producerRevision: string;
}): OpenSpecTaskOrdinalMapV1 {
  if (!input.workspaceRevision || !input.producerRevision) throw new Error('TASK_ORDINAL_MAP_REVISION_REQUIRED');
  if (!sha256Revision.safeParse(input.sourcePopulationChecksum).success) throw new Error('TASK_SOURCE_POPULATION_CHECKSUM_INVALID');
  if (!input.taskCards.length) throw new Error('TASK_ORDINAL_MAP_EMPTY_UNIVERSE');

  const seenStableKeys = new Set<string>();
  const rows = input.taskCards.map((card) => {
    const taskStableKey = typeof card.stableKey === 'string' ? card.stableKey : '';
    const taskRevision = typeof card.taskRevision === 'string' ? card.taskRevision : '';
    const sourcePath = typeof card.sourcePath === 'string' ? card.sourcePath : '';
    const sourceLine = card.sourceLine;
    const retrievalState = card.retrievalState;
    if (!taskStableKey || !taskRevision || !sourcePath || !Number.isInteger(sourceLine) || typeof sourceLine !== 'number') {
      throw new Error('TASK_ORDINAL_MAP_IDENTITY_INCOMPLETE');
    }
    if (seenStableKeys.has(taskStableKey)) throw new Error(`TASK_ORDINAL_MAP_DUPLICATE_STABLE_KEY:${taskStableKey}`);
    seenStableKeys.add(taskStableKey);
    const sourceFileRevision = input.taskFileHashes[sourcePath];
    if (!sha256Revision.safeParse(sourceFileRevision).success) {
      throw new Error(`TASK_ORDINAL_MAP_SOURCE_FILE_REVISION_MISSING:${sourcePath}`);
    }
    if (!['CURRENT', 'WAITING', 'REVIEW_REQUIRED'].includes(String(retrievalState))) {
      throw new Error(`TASK_ORDINAL_MAP_RETRIEVAL_STATE_NOT_INDEXABLE:${taskStableKey}`);
    }
    return {
      taskStableKey,
      taskRevision,
      sourcePath,
      sourceLine,
      sourceFileRevision,
      workspaceRevision: input.workspaceRevision,
      taskCardChecksum: candidateOrdinalMapChecksum(card),
      retrievalState,
    };
  });

  rows.sort((a, b) => compareUtf8(a.taskStableKey, b.taskStableKey));
  const taskUniverseRevision = revisionFromCanonicalValue(rows);
  const candidateSnapshotRevision = revisionFromCanonicalValue({
    universeKind: 'OPENSPEC_TASKCARD',
    workspaceRevision: input.workspaceRevision,
    taskUniverseRevision,
    sourcePopulationChecksum: input.sourcePopulationChecksum,
  });
  const candidates = rows.map((row, candidateOrdinal) => openSpecTaskOrdinalRowV1Schema.parse({
    ...row,
    candidateOrdinal,
  }));
  const checksumPayload = {
    schema: 'atlas.candidate-ordinal-map.v1',
    universeKind: 'OPENSPEC_TASKCARD',
    workspaceRevision: input.workspaceRevision,
    taskUniverseRevision,
    sourcePopulationChecksum: input.sourcePopulationChecksum,
    candidateSnapshotRevision,
    rowCount: candidates.length,
    candidates,
    identityAuthority: false,
    canonicalAuthority: false,
    producerRevision: input.producerRevision,
  };
  const map = openSpecTaskOrdinalMapV1Schema.parse({
    ...checksumPayload,
    ordinalMapChecksum: candidateOrdinalMapChecksum(checksumPayload),
  });
  assertOpenSpecTaskOrdinalMapIntegrityV1(map);
  return map;
}

export function assertOpenSpecTaskOrdinalMapIntegrityV1(mapInput: unknown): asserts mapInput is OpenSpecTaskOrdinalMapV1 {
  const map = openSpecTaskOrdinalMapV1Schema.parse(mapInput);
  if (map.rowCount !== map.candidates.length) throw new Error('TASK_ORDINAL_MAP_ROW_COUNT_MISMATCH');
  const seen = new Set<string>();
  map.candidates.forEach((row, index) => {
    if (row.candidateOrdinal !== index) throw new Error(`TASK_ORDINAL_MAP_ORDINAL_SEQUENCE_BROKEN:${index}`);
    if (row.workspaceRevision !== map.workspaceRevision) throw new Error(`TASK_ORDINAL_MAP_WORKSPACE_REVISION_MISMATCH:${index}`);
    if (seen.has(row.taskStableKey)) throw new Error(`TASK_ORDINAL_MAP_DUPLICATE_STABLE_KEY:${row.taskStableKey}`);
    seen.add(row.taskStableKey);
    if (index > 0 && compareUtf8(map.candidates[index - 1].taskStableKey, row.taskStableKey) >= 0) {
      throw new Error(`TASK_ORDINAL_MAP_ORDER_INVALID:${index}`);
    }
  });
  const rowsWithoutOrdinal = map.candidates.map(({ candidateOrdinal: _ordinal, ...row }) => row);
  if (revisionFromCanonicalValue(rowsWithoutOrdinal) !== map.taskUniverseRevision) {
    throw new Error('TASK_ORDINAL_MAP_UNIVERSE_REVISION_MISMATCH');
  }
  const snapshotRevision = revisionFromCanonicalValue({
    universeKind: map.universeKind,
    workspaceRevision: map.workspaceRevision,
    taskUniverseRevision: map.taskUniverseRevision,
    sourcePopulationChecksum: map.sourcePopulationChecksum,
  });
  if (snapshotRevision !== map.candidateSnapshotRevision) throw new Error('TASK_ORDINAL_MAP_SNAPSHOT_REVISION_MISMATCH');
  const { ordinalMapChecksum, ...checksumPayload } = map;
  if (candidateOrdinalMapChecksum(checksumPayload) !== ordinalMapChecksum) {
    throw new Error('TASK_ORDINAL_MAP_CHECKSUM_MISMATCH');
  }
}

export function assertOpenSpecTaskOrdinalMapReadbackV1(input: {
  ordinalMap: unknown;
  taskCards: readonly Record<string, unknown>[];
  taskFileHashes: Readonly<Record<string, string>>;
  workspaceRevision: string;
  sourcePopulationChecksum: string;
}): asserts input is typeof input & { ordinalMap: OpenSpecTaskOrdinalMapV1 } {
  assertOpenSpecTaskOrdinalMapIntegrityV1(input.ordinalMap);
  const map = input.ordinalMap;
  if (map.workspaceRevision !== input.workspaceRevision) throw new Error('TASK_ORDINAL_READBACK_WORKSPACE_REVISION_MISMATCH');
  if (map.sourcePopulationChecksum !== input.sourcePopulationChecksum) throw new Error('TASK_ORDINAL_READBACK_SOURCE_POPULATION_MISMATCH');
  if (input.taskCards.length !== map.rowCount) throw new Error('TASK_ORDINAL_READBACK_ROW_COUNT_MISMATCH');

  const expectedByKey = new Map<string, Record<string, unknown>>();
  for (const card of input.taskCards) {
    if (typeof card.stableKey !== 'string' || !card.stableKey || expectedByKey.has(card.stableKey)) {
      throw new Error('TASK_ORDINAL_READBACK_SOURCE_IDENTITY_INVALID');
    }
    expectedByKey.set(card.stableKey, card);
  }

  for (const row of map.candidates) {
    const card = expectedByKey.get(row.taskStableKey);
    if (!card) throw new Error(`TASK_ORDINAL_READBACK_SOURCE_CARD_MISSING:${row.taskStableKey}`);
    if (row.taskRevision !== card.taskRevision
      || row.sourcePath !== card.sourcePath
      || row.sourceLine !== card.sourceLine
      || row.sourceFileRevision !== input.taskFileHashes[String(card.sourcePath)]
      || row.taskCardChecksum !== candidateOrdinalMapChecksum(card)
      || row.retrievalState !== card.retrievalState) {
      throw new Error(`TASK_ORDINAL_READBACK_ROW_MISMATCH:${row.taskStableKey}`);
    }
    expectedByKey.delete(row.taskStableKey);
  }
  if (expectedByKey.size) throw new Error('TASK_ORDINAL_READBACK_SOURCE_CARD_UNMATCHED');
}

export type CanonicalCandidateIdentityInput = Omit<
  z.input<typeof canonicalCandidateV1Schema>,
  'schema' | 'candidateOrdinal' | 'candidateSnapshotRevision'
>;

/**
 * The only cohort shape admitted to the current structural/semantic spine.
 * Historical observations may remain nullable elsewhere, but an ordinal map
 * for the current source -> packet -> chunk frame must be explicitly bound.
 */
export const revisionQualifiedSourceChunkCohortV1Schema = z.object({
  status: z.literal('REVISION_QUALIFIED'),
  workspaceRevision: revision,
  candidateSnapshotRevision: revision,
  sourceRevisionSetChecksum: z.string().min(1),
  candidates: z.array(canonicalCandidateV1Schema).min(1),
}).strict().superRefine((cohort, ctx) => {
  cohort.candidates.forEach((candidate, index) => {
    if (candidate.workspaceRevision !== cohort.workspaceRevision) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates', index, 'workspaceRevision'], message: 'WORKSPACE_REVISION_MISMATCH' });
    }
    if (candidate.candidateSnapshotRevision !== cohort.candidateSnapshotRevision) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates', index, 'candidateSnapshotRevision'], message: 'CANDIDATE_SNAPSHOT_REVISION_MISMATCH' });
    }
    if (candidate.packetKey === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates', index, 'packetKey'], message: 'PACKET_IDENTITY_REQUIRED' });
    }
    if (candidate.sourceRef === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates', index, 'sourceRef'], message: 'SOURCE_REF_REQUIRED' });
    }
  });
});

export type RevisionQualifiedSourceChunkCohortV1 = z.infer<typeof revisionQualifiedSourceChunkCohortV1Schema>;

/**
 * Materialize ordinals only from a current, revision-qualified source/chunk
 * cohort. This is an admission boundary, not an authority claim: the result
 * remains a deterministic derived coordinate map and never performs I/O.
 */
export function materializeRevisionQualifiedSourceChunkOrdinalMapV1(input: {
  cohort: RevisionQualifiedSourceChunkCohortV1 | null | undefined;
  producerRevision: string;
}): CandidateOrdinalMapV1 {
  if (!input.cohort) throw new Error('CURRENT_SOURCE_CHUNK_COHORT_UNAVAILABLE');
  const cohort = revisionQualifiedSourceChunkCohortV1Schema.parse(input.cohort);
  if (!input.producerRevision) throw new Error('ORDINAL_MAP_PRODUCER_REVISION_REQUIRED');

  return materializeCandidateOrdinalMap({
    candidates: cohort.candidates.map(({ schema: _schema, candidateOrdinal: _ordinal, candidateSnapshotRevision: _snapshot, ...candidate }) => candidate),
    candidateSnapshotRevision: cohort.candidateSnapshotRevision,
    workspaceRevision: cohort.workspaceRevision,
    producerRevision: input.producerRevision,
  });
}

/**
 * Dense ordinals are assigned only after deterministic canonical ordering.
 * They are execution coordinates scoped to candidateSnapshotRevision and never
 * substitute for canonicalId/packetKey/treeNodeId/symbolVersionId.
 */
export function materializeCandidateOrdinalMap(input: {
  candidates: readonly CanonicalCandidateIdentityInput[];
  candidateSnapshotRevision: string;
  workspaceRevision: string;
  producerRevision: string;
}): CandidateOrdinalMapV1 {
  const seenCanonical = new Set<string>();
  const parsed = input.candidates.map((candidate) => canonicalCandidateV1BaseSchema.omit({
    schema: true,
    candidateOrdinal: true,
    candidateSnapshotRevision: true,
  }).parse(candidate));

  for (const candidate of parsed) {
    if (candidate.workspaceRevision !== input.workspaceRevision) {
      throw new Error(`CANDIDATE_WORKSPACE_REVISION_MISMATCH:${candidate.canonicalId}`);
    }
    if (seenCanonical.has(candidate.canonicalId)) {
      throw new Error(`CANDIDATE_CANONICAL_ID_DUPLICATE:${candidate.canonicalId}`);
    }
    seenCanonical.add(candidate.canonicalId);
  }

  const ordered = [...parsed].sort((a, b) => {
    const canonical = compareUtf8(a.canonicalId, b.canonicalId);
    if (canonical !== 0) return canonical;
    const source = compareUtf8(a.sourceRevision, b.sourceRevision);
    if (source !== 0) return source;
    return compareUtf8(a.packetKey ?? '', b.packetKey ?? '');
  });

  const candidates = ordered.map((candidate, candidateOrdinal) => canonicalCandidateV1Schema.parse({
    ...candidate,
    schema: CANONICAL_CANDIDATE_SCHEMA,
    candidateOrdinal,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
  }));

  const checksumPayload = {
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    workspaceRevision: input.workspaceRevision,
    candidates,
  };

  const map = candidateOrdinalMapV1Schema.parse({
    schema: CANDIDATE_ORDINAL_MAP_SCHEMA,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    workspaceRevision: input.workspaceRevision,
    rowCount: candidates.length,
    candidates,
    ordinalMapChecksum: candidateOrdinalMapChecksum(checksumPayload),
    identityAuthority: false,
    producerRevision: input.producerRevision,
  });

  // Never admit a map this constructor itself did not prove sound — every Arrow/GPU
  // materializer downstream relies on this invariant already holding by the time it receives one.
  assertCandidateOrdinalMapIntegrityV1(map);

  return map;
}

/**
 * Proves a `CandidateOrdinalMapV1` is internally consistent — NOT just schema-valid. A map can
 * pass `candidateOrdinalMapV1Schema.parse()` (every field individually well-typed) while still
 * being corrupt as a whole (wrong row count, misordered ordinals, mixed revisions, a stale
 * checksum). Every consumer that admits a map from an untrusted source (deserialized from Arrow,
 * read from cache, received over RPC) MUST call this before trusting `candidateOrdinal` as a dense
 * execution coordinate.
 */
export function assertCandidateOrdinalMapIntegrityV1(map: CandidateOrdinalMapV1): void {
  if (map.rowCount !== map.candidates.length) {
    throw new Error(
      `CANDIDATE_ORDINAL_MAP_ROW_COUNT_MISMATCH:declared=${map.rowCount}:actual=${map.candidates.length}`
    );
  }

  map.candidates.forEach((candidate, index) => {
    if (candidate.candidateOrdinal !== index) {
      throw new Error(
        `CANDIDATE_ORDINAL_MAP_ORDINAL_SEQUENCE_BROKEN:index=${index}:candidateOrdinal=${candidate.candidateOrdinal}`
      );
    }
    if (candidate.workspaceRevision !== map.workspaceRevision) {
      throw new Error(
        `CANDIDATE_ORDINAL_MAP_WORKSPACE_REVISION_MISMATCH:candidateOrdinal=${index}:candidate=${candidate.workspaceRevision}:map=${map.workspaceRevision}`
      );
    }
    if (candidate.candidateSnapshotRevision !== map.candidateSnapshotRevision) {
      throw new Error(
        `CANDIDATE_ORDINAL_MAP_SNAPSHOT_REVISION_MISMATCH:candidateOrdinal=${index}:candidate=${candidate.candidateSnapshotRevision}:map=${map.candidateSnapshotRevision}`
      );
    }
  });

  const recomputedChecksum = candidateOrdinalMapChecksum({
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    workspaceRevision: map.workspaceRevision,
    candidates: map.candidates,
  });
  if (recomputedChecksum !== map.ordinalMapChecksum) {
    throw new Error(
      `CANDIDATE_ORDINAL_MAP_CHECKSUM_MISMATCH:declared=${map.ordinalMapChecksum}:recomputed=${recomputedChecksum}`
    );
  }
}

export function resolveCanonicalCandidateByOrdinal(
  mapInput: z.input<typeof candidateOrdinalMapV1Schema>,
  candidateOrdinal: number,
): CanonicalCandidateV1 {
  const map = candidateOrdinalMapV1Schema.parse(mapInput);
  if (!Number.isInteger(candidateOrdinal) || candidateOrdinal < 0 || candidateOrdinal >= map.rowCount) {
    throw new Error(`CANDIDATE_ORDINAL_OUT_OF_RANGE:${candidateOrdinal}`);
  }
  const candidate = map.candidates[candidateOrdinal];
  if (!candidate || candidate.candidateOrdinal !== candidateOrdinal) {
    throw new Error(`CANDIDATE_ORDINAL_MAP_CORRUPT:${candidateOrdinal}`);
  }
  return candidate;
}

export function assertExecutorIdIsNotCanonicalIdentity(input: {
  canonicalId: string;
  candidateOrdinal?: number | null;
  qdrantPointId?: string | number | null;
  gpuNodeId?: string | number | null;
}): void {
  const canonical = String(input.canonicalId);
  for (const [kind, value] of [
    ['candidateOrdinal', input.candidateOrdinal],
    ['qdrantPointId', input.qdrantPointId],
    ['gpuNodeId', input.gpuNodeId],
  ] as const) {
    if (value !== null && value !== undefined && String(value) === canonical) {
      throw new Error(`EXECUTOR_IDENTITY_SUBSTITUTION_REJECTED:${kind}`);
    }
  }
}
