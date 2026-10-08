/** A fail-closed transactional boundary for DAG attempt state.
 * This does NOT create a table or authorize writes. An actual DB owner must implement
 * atomic compare-and-swap inside one transaction and pass deployment/readback gates.
 */
export type DagAttemptStatusV1 = 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SUPERSEDED';
export type DagAttemptIdentityV1 = Readonly<{
  runId: string; stepId: string; attemptId: string; dagRevision: string;
  sourceRevision: string; workspaceRevision: string; graphRevision: string;
  representationRevision: string; modelRevision: string; featureRevision: string;
  leaseId: string; generation: number;
}>;
export type DagAttemptRowV1 = Readonly<{ identity: DagAttemptIdentityV1; status: DagAttemptStatusV1; version: number }>;
export type DagAttemptTransitionV1 = Readonly<{
  before: DagAttemptRowV1;
  after: DagAttemptRowV1;
  evidenceDigest: string;
  idempotencyKey: string;
}>;
export type DagAttemptTransactionalPortV1 = {
  /** The adapter MUST check row version, all identity/revision fields, lease,
   * generation, status, dependencies, and evidence before committing; zero rows
   * affected must return null. No read-then-write implementation is permitted.
   */
  compareAndCommit(transition: DagAttemptTransitionV1): Promise<DagAttemptRowV1 | null>;
};
function assertIdentity(value: DagAttemptIdentityV1): void {
  const fields = [value.runId, value.stepId, value.attemptId, value.dagRevision,
    value.sourceRevision, value.workspaceRevision, value.graphRevision,
    value.representationRevision, value.modelRevision, value.featureRevision, value.leaseId];
  if (fields.some((field) => !field.trim()) || !Number.isSafeInteger(value.generation) || value.generation < 1) {
    throw new Error('DAG_ATTEMPT_IDENTITY_INVALID');
  }
}
function sameIdentity(a: DagAttemptIdentityV1, b: DagAttemptIdentityV1): boolean {
  return (Object.keys(a) as (keyof DagAttemptIdentityV1)[]).every((key) => a[key] === b[key]);
}
export function prepareDagAttemptTransitionV1(input: {
  before: DagAttemptRowV1; nextStatus: DagAttemptStatusV1;
  evidenceDigest: string; idempotencyKey: string;
}): DagAttemptTransitionV1 {
  assertIdentity(input.before.identity);
  const allowed: Record<DagAttemptStatusV1, readonly DagAttemptStatusV1[]> = {
    READY: ['RUNNING', 'SUPERSEDED'], RUNNING: ['SUCCEEDED', 'FAILED', 'SUPERSEDED'],
    FAILED: [], SUCCEEDED: [], SUPERSEDED: [],
  };
  if (!allowed[input.before.status].includes(input.nextStatus)) throw new Error('DAG_ATTEMPT_TRANSITION_INVALID');
  if (!input.evidenceDigest.trim() || !input.idempotencyKey.trim() ||
    !Number.isSafeInteger(input.before.version) || input.before.version < 0) {
    throw new Error('DAG_ATTEMPT_RECEIPT_INVALID');
  }
  return { before: input.before, after: { identity: input.before.identity,
    status: input.nextStatus, version: input.before.version + 1 },
    evidenceDigest: input.evidenceDigest, idempotencyKey: input.idempotencyKey };
}
export async function commitDagAttemptTransitionV1(
  port: DagAttemptTransactionalPortV1, transition: DagAttemptTransitionV1,
): Promise<DagAttemptRowV1> {
  if (!sameIdentity(transition.before.identity, transition.after.identity) ||
      transition.after.version !== transition.before.version + 1) {
    throw new Error('DAG_ATTEMPT_TRANSITION_TAMPERED');
  }
  const result = await port.compareAndCommit(transition);
  if (!result || result.status !== transition.after.status ||
      result.version !== transition.after.version ||
      !sameIdentity(result.identity, transition.after.identity)) {
    throw new Error('DAG_ATTEMPT_STALE_OR_UNVERIFIED');
  }
  return result;
}
