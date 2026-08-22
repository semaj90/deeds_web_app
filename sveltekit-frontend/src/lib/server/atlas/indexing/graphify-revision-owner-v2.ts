import { createHash } from 'node:crypto';
import { z } from 'zod';
import { graphifyRevisionAuthorityV2Schema, type GraphifyRevisionAuthorityV2 } from './graphify-revision-authority-v2.js';

export const GRAPHIFY_REVISION_OWNER_V2_SCHEMA = 'atlas.graphify-revision-owner.v2' as const;
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1);

export const graphifyRevisionStorageObservationV2Schema = z.object({
  graphifyRunsPresent: z.boolean(),
  graphifyFilesPresent: z.boolean(),
  requiredRunColumnsPresent: z.boolean(),
  requiredFileColumnsPresent: z.boolean(),
  logicalWorkspaceRevisionColumnsPresent: z.boolean(),
  logicalCodeSourceRevisionColumnPresent: z.boolean(),
  productionWriterPath: id.nullable(),
  productionWriterPresent: z.boolean(),
  productionWriterCreatesWorkspaceRevision: z.boolean(),
  productionWriterCreatesSourceRevision: z.boolean(),
  persistedMatchingRows: z.number().int().nonnegative(),
  notes: z.array(z.string()),
}).strict();
export type GraphifyRevisionStorageObservationV2 = z.infer<typeof graphifyRevisionStorageObservationV2Schema>;

export const graphifyRevisionOwnerV2Schema = z.object({
  schema: z.literal(GRAPHIFY_REVISION_OWNER_V2_SCHEMA),
  status: z.enum([
    'BLOCKED_SCHEMA_MISSING',
    'GRAPHIFY_REVISION_AUTHORITY_V2_MIGRATION_REQUIRED',
    'REVISION_OWNER_READY_FOR_CONTROLLED_CANARY',
    'REVISION_OWNER_PROVEN',
  ]),
  authority: graphifyRevisionAuthorityV2Schema,
  storage: graphifyRevisionStorageObservationV2Schema,
  durableOwnerBound: z.boolean(),
  revisionOwnerProven: z.boolean(),
  fanoutMayConsumeAsCanonical: z.boolean(),
  blockers: z.array(id),
  canonicalWriteAttempted: z.literal(false),
  readOnly: z.literal(true),
  producerRevision: id,
  ownerChecksum: checksum,
}).strict();
export type GraphifyRevisionOwnerV2 = z.infer<typeof graphifyRevisionOwnerV2Schema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function sha256(value: unknown): string { return createHash('sha256').update(stable(value), 'utf8').digest('hex'); }

export function classifyGraphifyRevisionOwnerV2(input: {
  authority: GraphifyRevisionAuthorityV2;
  storage: GraphifyRevisionStorageObservationV2;
  producerRevision: string;
}): GraphifyRevisionOwnerV2 {
  const authority = graphifyRevisionAuthorityV2Schema.parse(input.authority);
  const storage = graphifyRevisionStorageObservationV2Schema.parse(input.storage);
  const blockers: string[] = [];
  const baseSchemaReady = storage.graphifyRunsPresent && storage.graphifyFilesPresent && storage.requiredRunColumnsPresent && storage.requiredFileColumnsPresent;
  const v2SchemaReady = baseSchemaReady && storage.logicalWorkspaceRevisionColumnsPresent && storage.logicalCodeSourceRevisionColumnPresent;
  if (!baseSchemaReady) blockers.push('GRAPHIFY_LINEAGE_SCHEMA_NOT_READY');
  else if (!v2SchemaReady) blockers.push('GRAPHIFY_REVISION_AUTHORITY_V2_MIGRATION_REQUIRED');
  const writerReady = storage.productionWriterPresent && Boolean(storage.productionWriterPath)
    && storage.productionWriterCreatesWorkspaceRevision && storage.productionWriterCreatesSourceRevision;
  if (v2SchemaReady && !writerReady) blockers.push('GRAPHIFY_REVISION_PRODUCTION_WRITER_NOT_BOUND');
  const durableOwnerBound = v2SchemaReady && writerReady;
  const revisionOwnerProven = durableOwnerBound && storage.persistedMatchingRows > 0;
  if (durableOwnerBound && !revisionOwnerProven) blockers.push('CONTROLLED_PERSISTENCE_CANARY_NOT_PROVEN');

  const status: GraphifyRevisionOwnerV2['status'] = !baseSchemaReady
    ? 'BLOCKED_SCHEMA_MISSING'
    : !v2SchemaReady
      ? 'GRAPHIFY_REVISION_AUTHORITY_V2_MIGRATION_REQUIRED'
      : !revisionOwnerProven
        ? 'REVISION_OWNER_READY_FOR_CONTROLLED_CANARY'
        : 'REVISION_OWNER_PROVEN';
  const payload = {
    schema: GRAPHIFY_REVISION_OWNER_V2_SCHEMA,
    status,
    authority,
    storage,
    durableOwnerBound,
    revisionOwnerProven,
    fanoutMayConsumeAsCanonical: revisionOwnerProven,
    blockers,
    canonicalWriteAttempted: false as const,
    readOnly: true as const,
    producerRevision: input.producerRevision,
  };
  return graphifyRevisionOwnerV2Schema.parse({ ...payload, ownerChecksum: sha256(payload) });
}
