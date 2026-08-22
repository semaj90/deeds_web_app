import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  codeRevisionOwnerCanaryV1Schema,
  type CodeRevisionOwnerCanaryV1,
} from './code-revision-owner-canary-v1.js';

export const GRAPHIFY_SOURCE_INVENTORY_WRITE_PLAN_SCHEMA = 'atlas.graphify-source-inventory-write-plan.v1' as const;
export const GRAPHIFY_SOURCE_INVENTORY_WRITE_PLAN_REVISION = 'atlas.graphify-source-inventory-write-plan.2026-08-22.v3' as const;

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const sourceRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const id = z.string().min(1);

export const graphifySourceInventoryTargetV1Schema = z.object({
  runTable: z.literal('graphify_runs'),
  fileTable: z.literal('graphify_files'),
  gitRepositoryRevisionColumn: z.literal('repository_revision'),
  workspaceRevisionColumn: z.literal('workspace_revision'),
  sourceManifestDigestColumn: z.literal('source_manifest_digest'),
  legacySourceRevisionColumn: z.literal('source_revision'),
  codeSourceRevisionColumn: z.literal('code_source_revision'),
  sourceRefColumn: z.literal('source_ref'),
  contentDigestColumn: z.literal('content_hash'),
  byteLengthColumn: z.literal('byte_length'),
}).strict();
export type GraphifySourceInventoryTargetV1 = z.infer<typeof graphifySourceInventoryTargetV1Schema>;

export const graphifySourceInventoryWritePlanV1Schema = z.object({
  schema: z.literal(GRAPHIFY_SOURCE_INVENTORY_WRITE_PLAN_SCHEMA),
  planRevision: z.literal(GRAPHIFY_SOURCE_INVENTORY_WRITE_PLAN_REVISION),
  status: z.enum([
    'BLOCKED_BASE_SCHEMA_REQUIRED',
    'REVISION_AUTHORITY_V2_MIGRATION_REQUIRED',
    'READY_FOR_CANONICAL_WRITER_IMPLEMENTATION',
    'OWNER_ALREADY_BOUND_CONTROLLED_CANARY_REQUIRED',
    'OWNER_ALREADY_PROVEN_NO_NEW_WRITER',
  ]),
  canaryStatus: codeRevisionOwnerCanaryV1Schema.shape.status,
  canaryChecksum: checksum,
  authorityChecksum: checksum,
  target: graphifySourceInventoryTargetV1Schema.nullable(),
  plannedRunRevision: z.object({
    workspaceRevision: sourceRevision,
    sourceManifestDigest: checksum,
    repositoryRevision: id,
    workspaceRevisionKind: z.literal('SHA256_SOURCE_MANIFEST'),
    repositoryRevisionRole: z.literal('GIT_PROVENANCE_ONLY'),
  }).strict(),
  plannedFileRevision: z.object({
    sourceRef: id,
    codeSourceRevision: sourceRevision,
    contentDigest: checksum,
    byteLength: z.number().int().nonnegative(),
    revisionKind: z.literal('SHA256_EXACT_UTF8_SOURCE_BYTES'),
  }).strict(),
  requiredWriterBehavior: z.object({
    createsWorkspaceRevisionInsideBoundary: z.literal(true),
    createsSourceRevisionInsideBoundary: z.literal(true),
    preservesGitRepositoryRevisionProvenance: z.literal(true),
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

const V2_TARGET: GraphifySourceInventoryTargetV1 = {
  runTable: 'graphify_runs',
  fileTable: 'graphify_files',
  gitRepositoryRevisionColumn: 'repository_revision',
  workspaceRevisionColumn: 'workspace_revision',
  sourceManifestDigestColumn: 'source_manifest_digest',
  legacySourceRevisionColumn: 'source_revision',
  codeSourceRevisionColumn: 'code_source_revision',
  sourceRefColumn: 'source_ref',
  contentDigestColumn: 'content_hash',
  byteLengthColumn: 'byte_length',
};

/** Plans only the v2 logical-revision writer. Compatible legacy storage is an
 * input to migration safety, never a final durable authority target. */
export function planGraphifySourceInventoryWriterV1(input: {
  canary: CodeRevisionOwnerCanaryV1;
  producerRevision: string;
}): GraphifySourceInventoryWritePlanV1 {
  const canary = codeRevisionOwnerCanaryV1Schema.parse(input.canary);
  const baseSchemaReady = canary.storage.graphifyRunsPresent
    && canary.storage.graphifyFilesPresent
    && canary.storage.requiredRunColumnsPresent
    && canary.storage.requiredFileColumnsPresent;
  const v2SchemaReady = canary.storage.logicalWorkspaceRevisionColumnsPresent
    && canary.storage.logicalCodeSourceRevisionColumnPresent;

  let status: GraphifySourceInventoryWritePlanV1['status'];
  let target: GraphifySourceInventoryTargetV1 | null = null;
  let migrationRequired = false;
  let createNewWriterAllowed = false;
  const blockers: string[] = [];

  if (!baseSchemaReady) {
    status = 'BLOCKED_BASE_SCHEMA_REQUIRED';
    migrationRequired = true;
    blockers.push('GRAPHIFY_BASE_LINEAGE_SCHEMA_REQUIRED');
  } else if (!v2SchemaReady) {
    status = 'REVISION_AUTHORITY_V2_MIGRATION_REQUIRED';
    migrationRequired = true;
    blockers.push('GRAPHIFY_REVISION_AUTHORITY_V2_MIGRATION_REQUIRED');
    blockers.push('NO_LEGACY_REVISION_COLUMN_REINTERPRETATION');
  } else if (canary.status === 'REVISION_OWNER_PROVEN') {
    status = 'OWNER_ALREADY_PROVEN_NO_NEW_WRITER';
    target = V2_TARGET;
    blockers.push('SECOND_REVISION_WRITER_FORBIDDEN');
    blockers.push('WRITER_PLAN_COMPLETE_USE_PROVEN_OWNER');
  } else if (canary.storage.productionWriterPresent) {
    status = 'OWNER_ALREADY_BOUND_CONTROLLED_CANARY_REQUIRED';
    target = V2_TARGET;
    blockers.push('SECOND_REVISION_WRITER_FORBIDDEN');
    blockers.push('CONTROLLED_PERSISTENCE_CANARY_REQUIRED');
  } else {
    status = 'READY_FOR_CANONICAL_WRITER_IMPLEMENTATION';
    target = V2_TARGET;
    createNewWriterAllowed = true;
    blockers.push('CANONICAL_GRAPHIFY_SOURCE_INVENTORY_WRITER_NOT_IMPLEMENTED');
    blockers.push('CONTROLLED_PERSISTENCE_CANARY_REQUIRED_AFTER_WRITER_BINDING');
  }

  const payload = {
    schema: GRAPHIFY_SOURCE_INVENTORY_WRITE_PLAN_SCHEMA,
    planRevision: GRAPHIFY_SOURCE_INVENTORY_WRITE_PLAN_REVISION,
    status,
    canaryStatus: canary.status,
    canaryChecksum: canary.canaryChecksum,
    authorityChecksum: canary.authority.authorityChecksum,
    target,
    plannedRunRevision: {
      workspaceRevision: canary.authority.workspaceRevision,
      sourceManifestDigest: canary.authority.workspaceSourceManifestDigest,
      repositoryRevision: canary.authority.baseGitCommitOid,
      workspaceRevisionKind: 'SHA256_SOURCE_MANIFEST' as const,
      repositoryRevisionRole: 'GIT_PROVENANCE_ONLY' as const,
    },
    plannedFileRevision: {
      sourceRef: canary.authority.sourceRef,
      codeSourceRevision: canary.authority.sourceRevision,
      contentDigest: canary.authority.sourceContentDigest,
      byteLength: canary.authority.sourceByteLength,
      revisionKind: 'SHA256_EXACT_UTF8_SOURCE_BYTES' as const,
    },
    requiredWriterBehavior: {
      createsWorkspaceRevisionInsideBoundary: true as const,
      createsSourceRevisionInsideBoundary: true as const,
      preservesGitRepositoryRevisionProvenance: true as const,
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
  return graphifySourceInventoryWritePlanV1Schema.parse({ ...payload, planChecksum: sha256(payload) });
}
