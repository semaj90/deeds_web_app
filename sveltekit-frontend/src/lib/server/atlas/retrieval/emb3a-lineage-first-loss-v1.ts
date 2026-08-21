import { z } from 'zod';

export const Emb3aLineageFieldV1Schema = z.enum([
  'canonical_id',
  'packet_key',
  'source_ref',
  'tree_node_id',
  'symbol_version_id',
  'workspace_revision',
  'source_revision',
  'representation_id',
  'representation_revision',
  'embedding_model_revision',
]);
export type Emb3aLineageFieldV1 = z.infer<typeof Emb3aLineageFieldV1Schema>;

export const Emb3aLineagePresenceV1Schema = z.enum(['PRESENT', 'MISSING', 'NOT_APPLICABLE', 'NOT_PROVEN']);
export type Emb3aLineagePresenceV1 = z.infer<typeof Emb3aLineagePresenceV1Schema>;

export const Emb3aLineageFirstLossV1Schema = z.enum([
  'NONE',
  'CANONICAL_SOURCE_GAP',
  'SNAPSHOT_PROJECTION_GAP',
  'OUTBOX_REFERENCE_GAP',
  'BUILDER_PROPAGATION_GAP',
  'LIVE_PROJECTION_STALE',
  'PAYLOAD_INDEX_GAP',
  'NOT_PROVEN',
]);
export type Emb3aLineageFirstLossV1 = z.infer<typeof Emb3aLineageFirstLossV1Schema>;

export const Emb3aLineageFieldAuditV1Schema = z.object({
  field: Emb3aLineageFieldV1Schema,
  canonicalSource: Emb3aLineagePresenceV1Schema,
  snapshotPresent: Emb3aLineagePresenceV1Schema,
  outboxPresent: Emb3aLineagePresenceV1Schema,
  builderPresent: Emb3aLineagePresenceV1Schema,
  qdrantPayloadPresent: Emb3aLineagePresenceV1Schema,
  payloadIndexPresent: Emb3aLineagePresenceV1Schema,
  filterRequiresIndex: z.boolean(),
}).strict();
export type Emb3aLineageFieldAuditV1 = z.infer<typeof Emb3aLineageFieldAuditV1Schema>;

export const Emb3aLineageFieldResultV1Schema = z.object({
  field: Emb3aLineageFieldV1Schema,
  firstLoss: Emb3aLineageFirstLossV1Schema,
  projectionReady: z.boolean(),
  filterIndexReady: z.boolean(),
  diagnostics: z.array(z.string()),
}).strict();
export type Emb3aLineageFieldResultV1 = z.infer<typeof Emb3aLineageFieldResultV1Schema>;

export const Emb3aLineageAuditResultV1Schema = z.object({
  schema: z.literal('atlas.emb3a-lineage-first-loss.v1'),
  status: z.enum([
    'EMB3A_LINEAGE_PROVEN',
    'EMB3A_BLOCKED_BY_UPSTREAM_LINEAGE',
    'EMB3A_BLOCKED_BY_SNAPSHOT',
    'EMB3A_BLOCKED_BY_OUTBOX',
    'EMB3A_BLOCKED_BY_BUILDER',
    'EMB3A_BLOCKED_BY_STALE_PROJECTION',
    'EMB3A_BLOCKED_BY_PAYLOAD_INDEX',
    'EMB3A_LINEAGE_NOT_PROVEN',
  ]),
  fields: z.array(Emb3aLineageFieldResultV1Schema),
  writerPatchAllowed: z.boolean(),
  qdrantMutationAllowed: z.literal(false),
  canonicalMutationAllowed: z.literal(false),
}).strict();
export type Emb3aLineageAuditResultV1 = z.infer<typeof Emb3aLineageAuditResultV1Schema>;

function isMissing(value: Emb3aLineagePresenceV1): boolean {
  return value === 'MISSING';
}

function isUnknown(value: Emb3aLineagePresenceV1): boolean {
  return value === 'NOT_PROVEN';
}

export function classifyEmb3aLineageFieldV1(value: Emb3aLineageFieldAuditV1): Emb3aLineageFieldResultV1 {
  const input = Emb3aLineageFieldAuditV1Schema.parse(value);
  const diagnostics: string[] = [];
  let firstLoss: Emb3aLineageFirstLossV1 = 'NONE';

  if (isMissing(input.canonicalSource)) {
    firstLoss = 'CANONICAL_SOURCE_GAP';
    diagnostics.push('FIELD_NOT_POPULATED_BY_CANONICAL_SOURCE_OWNER');
  } else if (isUnknown(input.canonicalSource)) {
    firstLoss = 'NOT_PROVEN';
    diagnostics.push('CANONICAL_SOURCE_OWNER_NOT_PROVEN');
  } else if (input.snapshotPresent !== 'NOT_APPLICABLE' && isMissing(input.snapshotPresent)) {
    firstLoss = 'SNAPSHOT_PROJECTION_GAP';
    diagnostics.push('FIELD_LOST_BEFORE_OR_DURING_IMMUTABLE_SNAPSHOT');
  } else if (isUnknown(input.snapshotPresent)) {
    firstLoss = 'NOT_PROVEN';
    diagnostics.push('SNAPSHOT_PRESENCE_NOT_PROVEN');
  } else if (input.outboxPresent !== 'NOT_APPLICABLE' && isMissing(input.outboxPresent)) {
    firstLoss = 'OUTBOX_REFERENCE_GAP';
    diagnostics.push('FIELD_OR_SNAPSHOT_REFERENCE_LOST_AT_OUTBOX_BOUNDARY');
  } else if (isUnknown(input.outboxPresent)) {
    firstLoss = 'NOT_PROVEN';
    diagnostics.push('OUTBOX_PROPAGATION_NOT_PROVEN');
  } else if (isMissing(input.builderPresent)) {
    firstLoss = 'BUILDER_PROPAGATION_GAP';
    diagnostics.push('QDRANT_PAYLOAD_BUILDER_OMITS_FIELD');
  } else if (isUnknown(input.builderPresent)) {
    firstLoss = 'NOT_PROVEN';
    diagnostics.push('QDRANT_PAYLOAD_BUILDER_PROPAGATION_NOT_PROVEN');
  } else if (isMissing(input.qdrantPayloadPresent)) {
    firstLoss = 'LIVE_PROJECTION_STALE';
    diagnostics.push('BUILDER_SUPPORTS_FIELD_BUT_LIVE_QDRANT_PAYLOAD_DOES_NOT');
  } else if (isUnknown(input.qdrantPayloadPresent)) {
    firstLoss = 'NOT_PROVEN';
    diagnostics.push('LIVE_QDRANT_PAYLOAD_PRESENCE_NOT_PROVEN');
  } else if (input.filterRequiresIndex && isMissing(input.payloadIndexPresent)) {
    firstLoss = 'PAYLOAD_INDEX_GAP';
    diagnostics.push('FILTER_FIELD_POPULATED_BUT_PAYLOAD_INDEX_MISSING');
  } else if (input.filterRequiresIndex && isUnknown(input.payloadIndexPresent)) {
    firstLoss = 'NOT_PROVEN';
    diagnostics.push('PAYLOAD_INDEX_PRESENCE_NOT_PROVEN');
  }

  return Emb3aLineageFieldResultV1Schema.parse({
    field: input.field,
    firstLoss,
    projectionReady: firstLoss === 'NONE' || firstLoss === 'PAYLOAD_INDEX_GAP',
    filterIndexReady: !input.filterRequiresIndex || input.payloadIndexPresent === 'PRESENT',
    diagnostics,
  });
}

function aggregateStatus(rows: readonly Emb3aLineageFieldResultV1[]): Emb3aLineageAuditResultV1['status'] {
  const losses = new Set(rows.map((row) => row.firstLoss));
  if (losses.has('CANONICAL_SOURCE_GAP')) return 'EMB3A_BLOCKED_BY_UPSTREAM_LINEAGE';
  if (losses.has('SNAPSHOT_PROJECTION_GAP')) return 'EMB3A_BLOCKED_BY_SNAPSHOT';
  if (losses.has('OUTBOX_REFERENCE_GAP')) return 'EMB3A_BLOCKED_BY_OUTBOX';
  if (losses.has('BUILDER_PROPAGATION_GAP')) return 'EMB3A_BLOCKED_BY_BUILDER';
  if (losses.has('LIVE_PROJECTION_STALE')) return 'EMB3A_BLOCKED_BY_STALE_PROJECTION';
  if (losses.has('NOT_PROVEN')) return 'EMB3A_LINEAGE_NOT_PROVEN';
  if (losses.has('PAYLOAD_INDEX_GAP')) return 'EMB3A_BLOCKED_BY_PAYLOAD_INDEX';
  return 'EMB3A_LINEAGE_PROVEN';
}

/**
 * Pure classifier for the EMB3-F1A proof. It identifies the earliest observed
 * loss point and never fills a missing revision/identity from downstream data.
 */
export function classifyEmb3aLineageAuditV1(
  values: readonly Emb3aLineageFieldAuditV1[],
): Emb3aLineageAuditResultV1 {
  const parsed = values.map((value) => Emb3aLineageFieldAuditV1Schema.parse(value));
  const seen = new Set<Emb3aLineageFieldV1>();
  for (const value of parsed) {
    if (seen.has(value.field)) throw new Error(`EMB3A_DUPLICATE_LINEAGE_FIELD:${value.field}`);
    seen.add(value.field);
  }
  const fields = parsed.map(classifyEmb3aLineageFieldV1);
  const status = aggregateStatus(fields);
  return Emb3aLineageAuditResultV1Schema.parse({
    schema: 'atlas.emb3a-lineage-first-loss.v1',
    status,
    fields,
    writerPatchAllowed: status === 'EMB3A_BLOCKED_BY_BUILDER',
    qdrantMutationAllowed: false,
    canonicalMutationAllowed: false,
  });
}
