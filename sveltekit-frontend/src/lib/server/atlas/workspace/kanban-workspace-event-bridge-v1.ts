import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  type IdentityBearingProvenanceV2,
  type ObservationalMetadataV2,
  type WorkspaceEventProvenanceV2,
  computeIdentityDigestV2,
} from './workspace-event-provenance-v2.js';

export const TARGETED_INVALIDATION_SCHEMA = 'atlas.targeted-invalidation-manifest.v1' as const;
export const PROPOSED_WORKSPACE_EVENT_SCHEMA = 'atlas.proposed-workspace-event.v2' as const;

export const ACTIVE_LEASE_STATUSES = new Set([
  'ALLOCATED',
  'ACTIVE',
  'VALIDATING',
  'READY_FOR_REVIEW',
]);

export const AuthoritativeLeaseStateV1Schema = z
  .object({
    leaseId: z.string().min(1),
    taskId: z.string().min(1),
    executionRunId: z.string().min(1),
    ownerAgent: z.string().min(1),
    worktreeId: z.string().min(1),
    branch: z.string().min(1),
    baseCommit: z.string().min(1),
    status: z.string().min(1),
    leaseFenceToken: z.number().int().nonnegative(),
    expiresAt: z.string().datetime().nullable(),
    releasedAt: z.string().datetime().nullable(),
  })
  .strict();
export type AuthoritativeLeaseStateV1 = z.infer<typeof AuthoritativeLeaseStateV1Schema>;

export const WorktreeStreamHeadV1Schema = z
  .object({
    workspaceId: z.string().min(1),
    worktreeId: z.string().min(1),
    lastStreamSequence: z.number().int().nonnegative(),
    lastEventDigestV2: z.string().nullable(),
    baseCommit: z.string().min(1),
    seenIdempotencyKeys: z.array(z.string().min(1)),
  })
  .strict();
export type WorktreeStreamHeadV1 = z.infer<typeof WorktreeStreamHeadV1Schema>;

export const TargetedInvalidationManifestV1Schema = z
  .object({
    schema: z.literal(TARGETED_INVALIDATION_SCHEMA),
    manifestId: z.string().min(1),
    eventDigestV2: z.string().min(1),
    workspaceId: z.string().min(1),
    worktreeId: z.string().min(1),
    affectedSourceRefs: z.array(z.string().min(1)),
    invalidatedAstSymbols: z.array(z.string().min(1)),
    invalidatedPacketKeys: z.array(z.string().min(1)),
    invalidatedChunkIds: z.array(z.string().min(1)),
    invalidatedContextManifestIds: z.array(z.string().min(1)),
    // Safety and authority invariants
    blanketRebuild: z.literal(false),
    pageRankAuthorityPromoted: z.literal(false),
    naryAuthorityPromoted: z.literal(false),
    writesPerformed: z.literal(false),
    canonicalAuthority: z.literal(false),
  })
  .strict();
export type TargetedInvalidationManifestV1 = z.infer<typeof TargetedInvalidationManifestV1Schema>;

export const ProposedWorkspaceEventV2Schema = z
  .object({
    schema: z.literal(PROPOSED_WORKSPACE_EVENT_SCHEMA),
    eventType: z.string().min(1),
    streamSequence: z.number().int().positive(),
    identityDigestV2: z.string().min(1),
    provenanceV2: z.custom<WorkspaceEventProvenanceV2>(),
    affectedSourceRefs: z.array(z.string().min(1)),
  })
  .strict();
export type ProposedWorkspaceEventV2 = z.infer<typeof ProposedWorkspaceEventV2Schema>;

export const KanbanEventCandidateV1Schema = z
  .object({
    workspaceId: z.string().min(1),
    worktreeId: z.string().min(1),
    branch: z.string().min(1),
    taskId: z.string().min(1),
    executionRunId: z.string().min(1),
    leaseId: z.string().min(1),
    presentedFenceToken: z.number().int().nonnegative(),
    presentedBaseCommit: z.string().min(1),
    actor: z.string().min(1),
    idempotencyKey: z.string().min(1),
    eventType: z.string().min(1),
    affectedSourceRefs: z.array(z.string().min(1)),
    invalidatedAstSymbols: z.array(z.string().min(1)).optional(),
    invalidatedPacketKeys: z.array(z.string().min(1)).optional(),
    invalidatedChunkIds: z.array(z.string().min(1)).optional(),
    invalidatedContextManifestIds: z.array(z.string().min(1)).optional(),
    occurredAt: z.string().datetime(),
    tool: z.string().min(1),
    causationId: z.string().nullable().optional(),
    supersedesEventId: z.string().nullable().optional(),
    traceId: z.string().optional(),
    diagnosticNotes: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export type KanbanEventCandidateV1 = z.infer<typeof KanbanEventCandidateV1Schema>;

export type BridgeAdmissionRejectionReasonV1 =
  | 'WORKTREE_ISOLATION_VIOLATION'
  | 'LEASE_EXPIRED'
  | 'LEASE_NOT_ACTIVE'
  | 'LEASE_ID_MISMATCH'
  | 'STALE_FENCE_TOKEN'
  | 'FENCE_TOKEN_AHEAD'
  | 'STALE_BASE_COMMIT';

export type BridgeAdmissionResultV1 =
  | {
      decision: 'ACCEPT';
      proposedEvent: ProposedWorkspaceEventV2;
      invalidationManifest: TargetedInvalidationManifestV1;
      nextStreamHead: WorktreeStreamHeadV1;
    }
  | {
      decision: 'IDEMPOTENT_DUPLICATE_NOOP';
      reason: 'IDEMPOTENT_DUPLICATE_NOOP';
      idempotencyKey: string;
      streamHead: WorktreeStreamHeadV1;
    }
  | {
      decision: 'REJECT';
      rejectionReason: BridgeAdmissionRejectionReasonV1;
      message: string;
    };

export function createWorktreeStreamHeadV1(input: {
  workspaceId: string;
  worktreeId: string;
  baseCommit: string;
  initialSequence?: number;
}): WorktreeStreamHeadV1 {
  return WorktreeStreamHeadV1Schema.parse({
    workspaceId: input.workspaceId,
    worktreeId: input.worktreeId,
    lastStreamSequence: input.initialSequence ?? 0,
    lastEventDigestV2: null,
    baseCommit: input.baseCommit,
    seenIdempotencyKeys: [],
  });
}

/**
 * Pure, zero-DB-write adapter translating a Kanban task claim + worktree lease
 * into a proposed workspace event and targeted invalidation manifest.
 *
 * Validates:
 * 1. Worktree isolation (rejects cross-worktree or cross-workspace contamination)
 * 2. Idempotency (duplicate delivery returns an idempotent no-op)
 * 3. Lease fencing (monotonic fence token verification)
 * 4. Lease status and expiration
 * 5. Base commit integrity
 *
 * Guaranteed invariants:
 * - blanketRebuild: false
 * - pageRankAuthorityPromoted: false
 * - naryAuthorityPromoted: false
 * - writesPerformed: false
 * - canonicalAuthority: false
 * - replay sequence ordered strictly by monotonic streamSequence, not timestamps.
 */
export function proposeKanbanWorkspaceEventV1(input: {
  lease: AuthoritativeLeaseStateV1;
  head: WorktreeStreamHeadV1;
  candidate: KanbanEventCandidateV1;
  now?: string;
}): BridgeAdmissionResultV1 {
  const lease = AuthoritativeLeaseStateV1Schema.parse(input.lease);
  const head = WorktreeStreamHeadV1Schema.parse(input.head);
  const candidate = KanbanEventCandidateV1Schema.parse(input.candidate);
  const now = input.now ?? new Date().toISOString();

  // 1. Worktree isolation
  if (candidate.workspaceId !== head.workspaceId) {
    return {
      decision: 'REJECT',
      rejectionReason: 'WORKTREE_ISOLATION_VIOLATION',
      message: `Candidate workspaceId '${candidate.workspaceId}' does not match stream head '${head.workspaceId}'`,
    };
  }
  if (candidate.worktreeId !== head.worktreeId) {
    return {
      decision: 'REJECT',
      rejectionReason: 'WORKTREE_ISOLATION_VIOLATION',
      message: `Candidate worktreeId '${candidate.worktreeId}' does not match stream head '${head.worktreeId}'`,
    };
  }
  if (lease.worktreeId !== head.worktreeId) {
    return {
      decision: 'REJECT',
      rejectionReason: 'WORKTREE_ISOLATION_VIOLATION',
      message: `Lease worktreeId '${lease.worktreeId}' does not match stream head '${head.worktreeId}'`,
    };
  }

  // 2. Idempotency no-op
  if (head.seenIdempotencyKeys.includes(candidate.idempotencyKey)) {
    return {
      decision: 'IDEMPOTENT_DUPLICATE_NOOP',
      reason: 'IDEMPOTENT_DUPLICATE_NOOP',
      idempotencyKey: candidate.idempotencyKey,
      streamHead: head,
    };
  }

  // 3. Lease status & expiration
  if (!ACTIVE_LEASE_STATUSES.has(lease.status) || lease.releasedAt !== null) {
    return {
      decision: 'REJECT',
      rejectionReason: 'LEASE_NOT_ACTIVE',
      message: `Lease status '${lease.status}' is not active or lease was released`,
    };
  }
  if (lease.expiresAt && Date.parse(lease.expiresAt) <= Date.parse(now)) {
    return {
      decision: 'REJECT',
      rejectionReason: 'LEASE_EXPIRED',
      message: `Lease expired at '${lease.expiresAt}', current time is '${now}'`,
    };
  }

  // 4. Lease identity
  if (candidate.leaseId !== lease.leaseId) {
    return {
      decision: 'REJECT',
      rejectionReason: 'LEASE_ID_MISMATCH',
      message: `Candidate leaseId '${candidate.leaseId}' does not match authoritative lease '${lease.leaseId}'`,
    };
  }
  if (candidate.taskId !== lease.taskId) {
    return {
      decision: 'REJECT',
      rejectionReason: 'LEASE_ID_MISMATCH',
      message: `Candidate taskId '${candidate.taskId}' does not match authoritative lease taskId '${lease.taskId}'`,
    };
  }
  if (candidate.executionRunId !== lease.executionRunId) {
    return {
      decision: 'REJECT',
      rejectionReason: 'LEASE_ID_MISMATCH',
      message: `Candidate executionRunId '${candidate.executionRunId}' does not match authoritative lease '${lease.executionRunId}'`,
    };
  }

  // 5. Lease fence token
  if (candidate.presentedFenceToken < lease.leaseFenceToken) {
    return {
      decision: 'REJECT',
      rejectionReason: 'STALE_FENCE_TOKEN',
      message: `Presented fence token ${candidate.presentedFenceToken} is older than authoritative token ${lease.leaseFenceToken}`,
    };
  }
  if (candidate.presentedFenceToken > lease.leaseFenceToken) {
    return {
      decision: 'REJECT',
      rejectionReason: 'FENCE_TOKEN_AHEAD',
      message: `Presented fence token ${candidate.presentedFenceToken} is ahead of authoritative token ${lease.leaseFenceToken}`,
    };
  }

  // 6. Base commit check
  if (candidate.presentedBaseCommit !== head.baseCommit || candidate.presentedBaseCommit !== lease.baseCommit) {
    return {
      decision: 'REJECT',
      rejectionReason: 'STALE_BASE_COMMIT',
      message: `Presented baseCommit '${candidate.presentedBaseCommit}' does not match head '${head.baseCommit}' or lease '${lease.baseCommit}'`,
    };
  }

  // 7. Accept and build proposal
  const nextSequence = head.lastStreamSequence + 1;

  const identity: IdentityBearingProvenanceV2 = {
    schemaVersion: 'atlas.workspace-provenance.v2',
    workspaceId: candidate.workspaceId,
    worktreeId: candidate.worktreeId,
    branch: candidate.branch,
    baseCommit: candidate.presentedBaseCommit,
    taskId: candidate.taskId,
    executionRunId: candidate.executionRunId,
    leaseId: candidate.leaseId,
    leaseFenceToken: candidate.presentedFenceToken,
    actor: candidate.actor,
    idempotencyKey: candidate.idempotencyKey,
    causationId: candidate.causationId ?? null,
    supersedesEventId: candidate.supersedesEventId ?? null,
  };

  const observational: ObservationalMetadataV2 = {
    occurredAt: candidate.occurredAt,
    recordedAt: now,
    tool: candidate.tool,
    traceId: candidate.traceId,
    diagnosticNotes: candidate.diagnosticNotes,
  };

  const identityDigestV2 = computeIdentityDigestV2(
    candidate.eventType,
    nextSequence,
    candidate.affectedSourceRefs,
    identity,
  );

  const manifestHash = createHash('sha256')
    .update(`${identityDigestV2}:${nextSequence}`)
    .digest('hex')
    .slice(0, 32);

  const invalidationManifest: TargetedInvalidationManifestV1 = {
    schema: TARGETED_INVALIDATION_SCHEMA,
    manifestId: `inv_${manifestHash}`,
    eventDigestV2: identityDigestV2,
    workspaceId: candidate.workspaceId,
    worktreeId: candidate.worktreeId,
    affectedSourceRefs: [...new Set(candidate.affectedSourceRefs)].sort(),
    invalidatedAstSymbols: [...new Set(candidate.invalidatedAstSymbols ?? [])].sort(),
    invalidatedPacketKeys: [...new Set(candidate.invalidatedPacketKeys ?? [])].sort(),
    invalidatedChunkIds: [...new Set(candidate.invalidatedChunkIds ?? [])].sort(),
    invalidatedContextManifestIds: [...new Set(candidate.invalidatedContextManifestIds ?? [])].sort(),
    blanketRebuild: false,
    pageRankAuthorityPromoted: false,
    naryAuthorityPromoted: false,
    writesPerformed: false,
    canonicalAuthority: false,
  };

  const nextStreamHead: WorktreeStreamHeadV1 = {
    workspaceId: head.workspaceId,
    worktreeId: head.worktreeId,
    lastStreamSequence: nextSequence,
    lastEventDigestV2: identityDigestV2,
    baseCommit: head.baseCommit,
    seenIdempotencyKeys: [...head.seenIdempotencyKeys, candidate.idempotencyKey],
  };

  const proposedEvent: ProposedWorkspaceEventV2 = {
    schema: PROPOSED_WORKSPACE_EVENT_SCHEMA,
    eventType: candidate.eventType,
    streamSequence: nextSequence,
    identityDigestV2,
    provenanceV2: { ...identity, ...observational },
    affectedSourceRefs: candidate.affectedSourceRefs,
  };

  return {
    decision: 'ACCEPT',
    proposedEvent,
    invalidationManifest,
    nextStreamHead,
  };
}
