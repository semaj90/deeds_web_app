import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  codeRevisionAuthorityV1Schema,
  type CodeRevisionAuthorityV1,
} from './code-revision-authority-v1.js';

export const CODE_REVISION_OWNER_CANARY_SCHEMA = 'atlas.code-revision-owner-canary.v1' as const;

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1);

export const codeRevisionStorageObservationV1Schema = z.object({
  graphifyRunsPresent: z.boolean(),
  graphifyFilesPresent: z.boolean(),
  requiredRunColumnsPresent: z.boolean(),
  requiredFileColumnsPresent: z.boolean(),
  productionWriterPath: id.nullable(),
  productionWriterPresent: z.boolean(),
  productionWriterCreatesWorkspaceRevision: z.boolean(),
  productionWriterCreatesSourceRevision: z.boolean(),
  persistedMatchingRows: z.number().int().nonnegative(),
  sourceRevisionStorageSemantics: z.enum([
    'CODE_SOURCE_REVISION_V1',
    'LEGACY_GIT_SHA',
    'UNKNOWN',
  ]),
  notes: z.array(z.string()),
}).strict();
export type CodeRevisionStorageObservationV1 = z.infer<typeof codeRevisionStorageObservationV1Schema>;

export const codeRevisionOwnerCanaryV1Schema = z.object({
  schema: z.literal(CODE_REVISION_OWNER_CANARY_SCHEMA),
  status: z.enum([
    'REVISION_ORIGIN_SEMANTICS_PROVEN_DURABLE_OWNER_NOT_BOUND',
    'REVISION_OWNER_READY_FOR_CONTROLLED_CANARY',
    'REVISION_OWNER_PROVEN',
    'BLOCKED_SCHEMA_MISSING',
    'BLOCKED_STORAGE_SEMANTICS_MISMATCH',
  ]),
  authority: codeRevisionAuthorityV1Schema,
  storage: codeRevisionStorageObservationV1Schema,
  workspaceOriginSemanticsProven: z.literal(true),
  sourceOriginSemanticsProven: z.literal(true),
  durableOwnerBound: z.boolean(),
  revisionOwnerProven: z.boolean(),
  fanoutMayConsumeAsCanonical: z.boolean(),
  blockers: z.array(id),
  canonicalWriteAttempted: z.literal(false),
  readOnly: z.literal(true),
  producerRevision: id,
  canaryChecksum: checksum,
}).strict();
export type CodeRevisionOwnerCanaryV1 = z.infer<typeof codeRevisionOwnerCanaryV1Schema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

/**
 * Classifies whether the new origin semantics may be promoted to durable
 * revision authority. This classifier never writes or backfills a store.
 */
export function classifyCodeRevisionOwnerCanaryV1(input: {
  authority: CodeRevisionAuthorityV1;
  storage: CodeRevisionStorageObservationV1;
  producerRevision: string;
}): CodeRevisionOwnerCanaryV1 {
  const authority = codeRevisionAuthorityV1Schema.parse(input.authority);
  const storage = codeRevisionStorageObservationV1Schema.parse(input.storage);
  const blockers: string[] = [];

  if (!storage.graphifyRunsPresent || !storage.graphifyFilesPresent
      || !storage.requiredRunColumnsPresent || !storage.requiredFileColumnsPresent) {
    blockers.push('GRAPHIFY_LINEAGE_SCHEMA_NOT_READY');
  }
  if (storage.sourceRevisionStorageSemantics === 'LEGACY_GIT_SHA') {
    blockers.push('GRAPHIFY_SOURCE_REVISION_SEMANTICS_LEGACY_GIT_SHA');
  } else if (storage.sourceRevisionStorageSemantics === 'UNKNOWN') {
    blockers.push('GRAPHIFY_SOURCE_REVISION_STORAGE_SEMANTICS_UNPROVEN');
  }
  if (!storage.productionWriterPresent || !storage.productionWriterPath) {
    blockers.push('GRAPHIFY_REVISION_PRODUCTION_WRITER_NOT_BOUND');
  } else {
    if (!storage.productionWriterCreatesWorkspaceRevision) blockers.push('WORKSPACE_REVISION_WRITER_NOT_ORIGIN');
    if (!storage.productionWriterCreatesSourceRevision) blockers.push('SOURCE_REVISION_WRITER_NOT_ORIGIN');
  }

  const schemaReady = storage.graphifyRunsPresent
    && storage.graphifyFilesPresent
    && storage.requiredRunColumnsPresent
    && storage.requiredFileColumnsPresent;
  const semanticsReady = storage.sourceRevisionStorageSemantics === 'CODE_SOURCE_REVISION_V1';
  const writerReady = storage.productionWriterPresent
    && Boolean(storage.productionWriterPath)
    && storage.productionWriterCreatesWorkspaceRevision
    && storage.productionWriterCreatesSourceRevision;
  const durableOwnerBound = schemaReady && semanticsReady && writerReady;
  const revisionOwnerProven = durableOwnerBound && storage.persistedMatchingRows > 0;

  let status: CodeRevisionOwnerCanaryV1['status'];
  if (!schemaReady) status = 'BLOCKED_SCHEMA_MISSING';
  else if (!semanticsReady) status = 'BLOCKED_STORAGE_SEMANTICS_MISMATCH';
  else if (!writerReady) status = 'REVISION_ORIGIN_SEMANTICS_PROVEN_DURABLE_OWNER_NOT_BOUND';
  else if (!revisionOwnerProven) status = 'REVISION_OWNER_READY_FOR_CONTROLLED_CANARY';
  else status = 'REVISION_OWNER_PROVEN';

  if (!revisionOwnerProven && blockers.length === 0) blockers.push('CONTROLLED_PERSISTENCE_CANARY_NOT_PROVEN');

  const payload = {
    schema: CODE_REVISION_OWNER_CANARY_SCHEMA,
    status,
    authority,
    storage,
    workspaceOriginSemanticsProven: true as const,
    sourceOriginSemanticsProven: true as const,
    durableOwnerBound,
    revisionOwnerProven,
    fanoutMayConsumeAsCanonical: revisionOwnerProven,
    blockers,
    canonicalWriteAttempted: false as const,
    readOnly: true as const,
    producerRevision: input.producerRevision,
  };
  return codeRevisionOwnerCanaryV1Schema.parse({
    ...payload,
    canaryChecksum: sha256(payload),
  });
}
