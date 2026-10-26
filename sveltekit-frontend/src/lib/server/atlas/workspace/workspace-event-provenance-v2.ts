import { createHash } from 'node:crypto';

/**
 * Identity-bearing fields that affect event legitimacy, fencing, or replay.
 * Included in canonical identityDigestV2.
 */
export interface IdentityBearingProvenanceV2 {
  schemaVersion: 'atlas.workspace-provenance.v2';
  workspaceId: string;
  worktreeId: string;
  branch: string;
  baseCommit: string;              // Expected git commit or sha256:<64hex> source revision
  taskId: string;
  executionRunId: string;
  leaseId: string;
  leaseFenceToken: number;         // Monotonic integer fence token; rejects expired/split-brain leases
  actor: string;
  idempotencyKey: string;
  causationId: string | null;
  supersedesEventId: string | null;
}

/**
 * Observational metadata recorded at ingestion time.
 * Excluded from identityDigestV2 so diagnostic retries do not alter event identity.
 */
export interface ObservationalMetadataV2 {
  occurredAt: string;              // ISO-8601 when agent produced the candidate
  recordedAt: string;              // ISO-8601 when ledger accepted the candidate
  tool: string;
  traceId?: string;
  diagnosticNotes?: Record<string, string>;
}

export type WorkspaceEventProvenanceV2 = IdentityBearingProvenanceV2 & ObservationalMetadataV2;

export function computeIdentityDigestV2(
  eventType: string,
  streamSequence: number,
  affectedSourceRefs: readonly string[],
  identity: IdentityBearingProvenanceV2
): string {
  const sortedRefs = [...new Set(affectedSourceRefs)].sort();
  const canonicalPayload = JSON.stringify({
    v: 'v2',
    eventType,
    streamSequence,
    workspaceId: identity.workspaceId,
    worktreeId: identity.worktreeId,
    branch: identity.branch,
    baseCommit: identity.baseCommit,
    taskId: identity.taskId,
    executionRunId: identity.executionRunId,
    leaseId: identity.leaseId,
    leaseFenceToken: identity.leaseFenceToken,
    actor: identity.actor,
    idempotencyKey: identity.idempotencyKey,
    causationId: identity.causationId,
    supersedesEventId: identity.supersedesEventId,
    affectedSourceRefs: sortedRefs,
  });
  return `ev_v2_${createHash('sha256').update(canonicalPayload, 'utf8').digest('hex')}`;
}
