import { createHash } from 'node:crypto';
import { z } from 'zod';

import { type GraphifyStructuralTombstoneV1 } from './graphify-structural-batch-v1.js';

export const CanonicalLifecycleResolutionV1Schema = z.object({
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  currentWorkspaceRevision: z.string().min(1),
  currentSourceRevision: z.string().min(1).nullable(),
  currentContentHash: z.string().min(1).nullable(),
  lifecycleState: z.enum(['ACTIVE', 'SUPERSEDED', 'DELETED']),
}).strict();
export type CanonicalLifecycleResolutionV1 = z.infer<typeof CanonicalLifecycleResolutionV1Schema>;

export const CanonicalLifecycleReconcileStatusV1Schema = z.enum([
  'READY_FOR_PERSISTENCE_OWNER',
  'BLOCKED_IDENTITY_UNRESOLVED',
  'BLOCKED_WORKSPACE_REVISION_MISMATCH',
  'BLOCKED_SOURCE_LINEAGE_UNAVAILABLE',
  'BLOCKED_SOURCE_REVISION_MISMATCH',
  'ALREADY_TERMINAL',
]);
export type CanonicalLifecycleReconcileStatusV1 = z.infer<typeof CanonicalLifecycleReconcileStatusV1Schema>;

export const CanonicalLifecycleInvalidationTargetV1Schema = z.enum([
  'QDRANT',
  'NEO4J',
  'VALKEY',
  'ARROW_IPC',
]);
export type CanonicalLifecycleInvalidationTargetV1 = z.infer<typeof CanonicalLifecycleInvalidationTargetV1Schema>;

export const CanonicalLifecycleReconcileReceiptV1Schema = z.object({
  schema: z.literal('atlas.canonical-lifecycle-reconcile-receipt.v1'),
  status: CanonicalLifecycleReconcileStatusV1Schema,
  sourceRef: z.string().min(1),
  workspaceRevision: z.string().min(1),
  deletionEventAnchor: z.string().min(1),
  priorContentHash: z.string().min(1).nullable(),
  canonicalId: z.string().min(1).nullable(),
  packetKey: z.string().min(1).nullable(),
  currentSourceRevision: z.string().min(1).nullable(),
  currentContentHash: z.string().min(1).nullable(),
  currentLifecycleState: z.enum(['ACTIVE', 'SUPERSEDED', 'DELETED']).nullable(),
  proposedLifecycleState: z.literal('SUPERSEDED').nullable(),
  invalidationTargets: z.array(CanonicalLifecycleInvalidationTargetV1Schema),
  tombstoneObserved: z.literal(true),
  canonicalIdentityValidated: z.boolean(),
  workspaceRevisionMatched: z.boolean(),
  sourceLineageMatched: z.boolean(),
  observationIsMutationAuthority: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
  persistenceOwnerRequired: z.literal(true),
  producerRevision: z.string().min(1),
  receiptDigest: z.string().regex(/^[0-9a-f]{64}$/),
  diagnostics: z.array(z.string()),
}).strict();
export type CanonicalLifecycleReconcileReceiptV1 = z.infer<typeof CanonicalLifecycleReconcileReceiptV1Schema>;

export type CanonicalLifecycleReconcileInputV1 = {
  tombstone: GraphifyStructuralTombstoneV1;
  canonical: CanonicalLifecycleResolutionV1 | null;
  invalidationTargets?: readonly CanonicalLifecycleInvalidationTargetV1[];
  producerRevision: string;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function digest(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

/**
 * Pure hand-off contract between a structural DELETE observation and the
 * future canonical persistence/lifecycle owner.
 *
 * `tombstone.sourceVersionAnchor` identifies the deletion observation itself;
 * it is NOT assumed to be the prior canonical source revision. Freshness is
 * therefore checked against `priorContentHash` when that evidence is present.
 * If prior lineage is absent, the reconciler fails closed rather than guessing.
 *
 * This function never mutates Postgres, Qdrant, Neo4j, Valkey, Arrow, or any
 * canonical identity. READY means only that a separate persistence owner may
 * evaluate the proposed lifecycle transition and projection invalidations.
 */
export function reconcileStructuralTombstoneV1(
  value: CanonicalLifecycleReconcileInputV1,
): CanonicalLifecycleReconcileReceiptV1 {
  const tombstone = value.tombstone;
  const targets = [...new Set(value.invalidationTargets ?? ['QDRANT', 'NEO4J', 'VALKEY'])]
    .sort() as CanonicalLifecycleInvalidationTargetV1[];
  const diagnostics: string[] = [];

  let status: CanonicalLifecycleReconcileStatusV1;
  let identityValidated = false;
  let workspaceMatched = false;
  let sourceLineageMatched = false;

  if (!value.canonical) {
    status = 'BLOCKED_IDENTITY_UNRESOLVED';
    diagnostics.push('CANONICAL_IDENTITY_REQUIRED_BEFORE_LIFECYCLE_MUTATION');
  } else if (value.canonical.sourceRef !== tombstone.sourceRef) {
    status = 'BLOCKED_IDENTITY_UNRESOLVED';
    diagnostics.push('CANONICAL_SOURCE_REF_MISMATCH');
  } else {
    identityValidated = true;
    workspaceMatched = value.canonical.currentWorkspaceRevision === tombstone.workspaceRevision;

    if (tombstone.priorContentHash && value.canonical.currentContentHash) {
      sourceLineageMatched = tombstone.priorContentHash === value.canonical.currentContentHash;
    }

    if (!workspaceMatched) {
      status = 'BLOCKED_WORKSPACE_REVISION_MISMATCH';
      diagnostics.push('STALE_DELETE_WORKSPACE_REVISION');
    } else if (!tombstone.priorContentHash || !value.canonical.currentContentHash) {
      status = 'BLOCKED_SOURCE_LINEAGE_UNAVAILABLE';
      diagnostics.push('PRIOR_CONTENT_HASH_REQUIRED_FOR_DELETE_FRESHNESS');
    } else if (!sourceLineageMatched) {
      status = 'BLOCKED_SOURCE_REVISION_MISMATCH';
      diagnostics.push('STALE_DELETE_PRIOR_CONTENT_HASH_MISMATCH');
    } else if (value.canonical.lifecycleState === 'SUPERSEDED' || value.canonical.lifecycleState === 'DELETED') {
      status = 'ALREADY_TERMINAL';
      diagnostics.push('CANONICAL_ENTITY_ALREADY_TERMINAL');
    } else {
      status = 'READY_FOR_PERSISTENCE_OWNER';
      diagnostics.push('DELETE_OBSERVATION_VALIDATED_NO_MUTATION_PERFORMED');
    }
  }

  const body = {
    schema: 'atlas.canonical-lifecycle-reconcile-receipt.v1' as const,
    status,
    sourceRef: tombstone.sourceRef,
    workspaceRevision: tombstone.workspaceRevision,
    deletionEventAnchor: tombstone.sourceVersionAnchor,
    priorContentHash: tombstone.priorContentHash,
    canonicalId: value.canonical?.canonicalId ?? null,
    packetKey: value.canonical?.packetKey ?? null,
    currentSourceRevision: value.canonical?.currentSourceRevision ?? null,
    currentContentHash: value.canonical?.currentContentHash ?? null,
    currentLifecycleState: value.canonical?.lifecycleState ?? null,
    proposedLifecycleState: status === 'READY_FOR_PERSISTENCE_OWNER' ? 'SUPERSEDED' as const : null,
    invalidationTargets: status === 'READY_FOR_PERSISTENCE_OWNER' ? targets : [],
    tombstoneObserved: true as const,
    canonicalIdentityValidated: identityValidated,
    workspaceRevisionMatched: workspaceMatched,
    sourceLineageMatched,
    observationIsMutationAuthority: false as const,
    canonicalWritesAllowed: false as const,
    persistenceOwnerRequired: true as const,
    producerRevision: value.producerRevision,
    diagnostics,
  };

  return CanonicalLifecycleReconcileReceiptV1Schema.parse({
    ...body,
    receiptDigest: digest(body),
  });
}
