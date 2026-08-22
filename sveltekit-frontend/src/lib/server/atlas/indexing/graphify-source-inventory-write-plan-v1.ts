import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  codeRevisionOwnerCanaryV1Schema,
  type CodeRevisionOwnerCanaryV1,
} from './code-revision-owner-canary-v1.js';

export const GRAPHIFY_SOURCE_INVENTORY_WRITE_PLAN_SCHEMA = 'atlas.graphify-source-inventory-write-plan.v1' as const;
export const GRAPHIFY_SOURCE_INVENTORY_WRITE_PLAN_REVISION = 'atlas.graphify-source-inventory-write-plan.2026-08-21.v2' as const;

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1);

export const graphifySourceInventoryTargetV1Schema = z.object({
  runTable: z.literal('graphify_runs'),
  fileTable: z.literal('graphify_files'),
  workspaceRevisionColumn: z.literal('repository_revision'),
  sourceRevisionAuthorityColumn: z.enum(['source_revision', 'content_hash']),
  legacySourceRevisionColumn: z.literal('source_revision'),
  sourceRefColumn: z.literal('source_ref'),
  contentDigestColumn: z.literal('content_hash'),
  byteLengthColumn: z.literal('byte_length'),
}).strict();
export type GraphifySourceInventoryTargetV1 = z.infer<typeof graphifySourceInventoryTargetV1Schema>;

export const graphifySourceInventoryWritePlanV1Schema = z.object({
  schema: z.literal(GRAPHIFY_SOURCE_INVENTORY_WRITE_PLAN_SCHEMA),
  planRevision: z.literal(GRAPHIFY_SOURCE_INVENTORY_WRITE_PLAN_REVISION),
  status: z.enum([
    'BLOCKED_SCHEMA_DECISION_REQUIRED',
    'BLOCKED_STORAGE_SEMANTICS_DECISION_REQUIRED',
    'READY_FOR_CANONICAL_WRITER_IMPLEMENTATION',
    'OWNER_ALREADY_BOUND_CONTROLLED_CANARY_REQUIRED',
    'OWNER_ALREADY_PROVEN_NO_NEW_WRITER',
  ]),
  canaryStatus: codeRevisionOwnerCanaryV1Schema.shape.status,
  canaryChecksum: checksum,
  authorityChecksum: checksum,
  storageStrategy: z.enum([
    'NONE',
    'EXISTING_GRAPHIFY_LINEAGE',
    'VERSIONED_LINEAGE_SCHEMA_REQUIRED',
  ]),
  target: graphifySourceInventoryTargetV1Schema.nullable(),
  plannedRunRevision: z.object({
    workspaceRevision: id,
    revisionKind: z.literal('GIT_COMMIT_SHA'),
  }).strict(),
  plannedFileRevision: z.object({
    sourceRef: id,
    sourceRevision: id,
    revisionKind: z.literal('SHA256_EXACT_UTF8_SOURCE_BYTES'),
    contentDigest: checksum,
    byteLength: z.number().int().nonnegative(),
  }).strict(),
  requiredWriterBehavior: z.object({
    createsWorkspaceRevisionInsideBoundary: z.literal(true),
    createsSourceRevisionInsideBoundary: z.literal(true),
    preservesLegacySourceRevisionSemantics: z.literal(true),
    acceptsCallerWorkspaceRevisionAsAuthority: z.literal(false),
    acceptsCallerSourceRevisionAsAuthority: z.literal(false),
    writesRunAndFileLineageTransactionally: z.literal(true),
    exactReadbackRequiredBeforePromotion: z.literal(true),
  }).strict(),
  migrationRequired: z.boolean(),
  createNewWriterAllowed: z.boolean(),
  applyAllowed: z.literal(false),
  canonicalWriteAttempted: z.literal(false),
  fanoutMayConsumeAsCanonical: z.literal(false),
  blockers: z.array(id),
  producerRevision: id,
  planChecksum: checksum,
}).strict();
export type GraphifySourceInventoryWritePlanV1 = z.infer<typeof graphifySourceInventoryWritePlanV1Schema>;

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

function existingTarget(canary: CodeRevisionOwnerCanaryV1): GraphifySourceInventoryTargetV1 | null {
  const authorityColumn = canary.storage.sourceRevisionAuthorityField === 'SOURCE_REVISION'
    ? 'source_revision'
    : canary.storage.sourceRevisionAuthorityField === 'CONTENT_HASH'
      ? 'content_hash'
      : null;
  if (!authorityColumn) return null;
  return {
    runTable: 'graphify_runs',
    fileTable: 'graphify_files',
    workspaceRevisionColumn: 'repository_revision',
    sourceRevisionAuthorityColumn: authorityColumn,
    legacySourceRevisionColumn: 'source_revision',
    sourceRefColumn: 'source_ref',
    contentDigestColumn: 'content_hash',
    byteLengthColumn: 'byte_length',
  };
}

/**
 * Produces the next writer-integration decision from a live/read-only canary.
 * This planner never authorizes writes and never reinterprets the historical
 * graphify_files.source_revision column when content_hash is the selected
 * exact-byte authority field.
 */
export function planGraphifySourceInventoryWriterV1(input: {
  canary: CodeRevisionOwnerCanaryV1;
  producerRevision: string;
}): GraphifySourceInventoryWritePlanV1 {
  const canary = codeRevisionOwnerCanaryV1Schema.parse(input.canary);
  const blockers: string[] = [];
  let status: GraphifySourceInventoryWritePlanV1['status'];
  let storageStrategy: GraphifySourceInventoryWritePlanV1['storageStrategy'];
  let target: GraphifySourceInventoryTargetV1 | null = null;
  let migrationRequired = false;
  let createNewWriterAllowed = false;

  switch (canary.status) {
    case 'BLOCKED_SCHEMA_MISSING':
      status = 'BLOCKED_SCHEMA_DECISION_REQUIRED';
      storageStrategy = 'NONE';
      migrationRequired = true;
      blockers.push('GRAPHIFY_LINEAGE_SCHEMA_REVIEW_REQUIRED');
      break;
    case 'BLOCKED_STORAGE_SEMANTICS_MISMATCH':
      status = 'BLOCKED_STORAGE_SEMANTICS_DECISION_REQUIRED';
      storageStrategy = 'VERSIONED_LINEAGE_SCHEMA_REQUIRED';
      migrationRequired = true;
      blockers.push('NO_LEGACY_SOURCE_REVISION_REINTERPRETATION');
      blockers.push('VERSIONED_SOURCE_REVISION_STORAGE_DECISION_REQUIRED');
      break;
    case 'REVISION_ORIGIN_SEMANTICS_PROVEN_DURABLE_OWNER_NOT_BOUND':
      status = 'READY_FOR_CANONICAL_WRITER_IMPLEMENTATION';
      storageStrategy = 'EXISTING_GRAPHIFY_LINEAGE';
      target = existingTarget(canary);
      if (!target) throw new Error('COMPATIBLE_CANARY_MISSING_SOURCE_REVISION_AUTHORITY_FIELD');
      createNewWriterAllowed = true;
      blockers.push('CANONICAL_GRAPHIFY_SOURCE_INVENTORY_WRITER_NOT_IMPLEMENTED');
      blockers.push('CONTROLLED_PERSISTENCE_CANARY_REQUIRED_AFTER_WRITER_BINDING');
      break;
    case 'REVISION_OWNER_READY_FOR_CONTROLLED_CANARY':
      status = 'OWNER_ALREADY_BOUND_CONTROLLED_CANARY_REQUIRED';
      storageStrategy = 'EXISTING_GRAPHIFY_LINEAGE';
      target = existingTarget(canary);
      if (!target) throw new Error('BOUND_CANARY_MISSING_SOURCE_REVISION_AUTHORITY_FIELD');
      blockers.push('SECOND_REVISION_WRITER_FORBIDDEN');
      blockers.push('CONTROLLED_PERSISTENCE_CANARY_REQUIRED');
      break;
    case 'REVISION_OWNER_PROVEN':
      status = 'OWNER_ALREADY_PROVEN_NO_NEW_WRITER';
      storageStrategy = 'EXISTING_GRAPHIFY_LINEAGE';
      target = existingTarget(canary);
      if (!target) throw new Error('PROVEN_CANARY_MISSING_SOURCE_REVISION_AUTHORITY_FIELD');
      blockers.push('SECOND_REVISION_WRITER_FORBIDDEN');
      blockers.push('WRITER_PLAN_COMPLETE_USE_PROVEN_OWNER');
      break;
  }

  const payload = {
    schema: GRAPHIFY_SOURCE_INVENTORY_WRITE_PLAN_SCHEMA,
    planRevision: GRAPHIFY_SOURCE_INVENTORY_WRITE_PLAN_REVISION,
    status,
    canaryStatus: canary.status,
    canaryChecksum: canary.canaryChecksum,
    authorityChecksum: canary.authority.authorityChecksum,
    storageStrategy,
    target,
    plannedRunRevision: {
      workspaceRevision: canary.authority.workspaceRevision,
      revisionKind: 'GIT_COMMIT_SHA' as const,
    },
    plannedFileRevision: {
      sourceRef: canary.authority.sourceRef,
      sourceRevision: canary.authority.sourceRevision,
      revisionKind: 'SHA256_EXACT_UTF8_SOURCE_BYTES' as const,
      contentDigest: canary.authority.sourceContentDigest,
      byteLength: canary.authority.sourceByteLength,
    },
    requiredWriterBehavior: {
      createsWorkspaceRevisionInsideBoundary: true as const,
      createsSourceRevisionInsideBoundary: true as const,
      preservesLegacySourceRevisionSemantics: true as const,
      acceptsCallerWorkspaceRevisionAsAuthority: false as const,
      acceptsCallerSourceRevisionAsAuthority: false as const,
      writesRunAndFileLineageTransactionally: true as const,
      exactReadbackRequiredBeforePromotion: true as const,
    },
    migrationRequired,
    createNewWriterAllowed,
    applyAllowed: false as const,
    canonicalWriteAttempted: false as const,
    fanoutMayConsumeAsCanonical: false as const,
    blockers,
    producerRevision: input.producerRevision,
  };

  return graphifySourceInventoryWritePlanV1Schema.parse({
    ...payload,
    planChecksum: sha256(payload),
  });
}
