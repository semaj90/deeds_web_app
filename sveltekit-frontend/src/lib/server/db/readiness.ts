/**
 * PostgreSQL readiness contract: STARTING | HEALTHY | UNAVAILABLE.
 *
 * Pure, side-effect-free (imports no pool) so health routes, workers, the E2E
 * runner and the agentic-repair path can share one classification.
 *
 * Why: a crash-recovery startup ("the database system is starting up",
 * SQLSTATE 57P03) is expected and self-resolving. It must not be collapsed into
 * UNAVAILABLE, and it must never create an agentic-repair task.
 *
 * STARTING requires explicit evidence (SQLSTATE 57P03 "starting up" /
 * "in recovery mode", or `pg_isready` exit 1). ECONNREFUSED alone is NOT proof of
 * startup and classifies as UNAVAILABLE (retryable).
 */

export type DatabaseHealthState = 'starting' | 'healthy' | 'unavailable';

export type DatabaseReadinessReason =
  | 'OK'
  | 'STARTING_UP'
  | 'IN_RECOVERY'
  | 'PG_ISREADY_REJECTING'
  | 'SHUTTING_DOWN'
  | 'CONNECTION_REFUSED'
  | 'NO_RESPONSE'
  | 'TIMEOUT'
  | 'AUTH_OR_CONFIG'
  | 'UNKNOWN_ERROR';

export interface DatabaseReadinessClassification {
  state: DatabaseHealthState;
  reason: DatabaseReadinessReason;
  sqlstate: string | null;
  /** True when a later retry may succeed without operator action. */
  retryable: boolean;
}

const MAX_CAUSE_DEPTH = 5;

function errorChain(error: unknown): Array<{ code: string | null; message: string }> {
  const chain: Array<{ code: string | null; message: string }> = [];
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current != null; depth += 1) {
    if (typeof current === 'string') {
      chain.push({ code: null, message: current });
      break;
    }
    if (typeof current !== 'object') break;
    const record = current as { code?: unknown; message?: unknown; cause?: unknown };
    chain.push({
      code: typeof record.code === 'string' ? record.code : null,
      message: typeof record.message === 'string' ? record.message : '',
    });
    current = record.cause;
  }
  return chain;
}

/** Classify a thrown pg / Drizzle / network error. Walks `.cause` (Drizzle wraps pg errors). */
export function classifyPostgresError(error: unknown): DatabaseReadinessClassification {
  const chain = errorChain(error);
  const sqlstate = chain.find((entry) => entry.code && /^[0-9A-Z]{5}$/.test(entry.code))?.code ?? null;
  const text = chain.map((entry) => entry.message).join(' | ').toLowerCase();

  if (/database system is shutting down/.test(text)) {
    return { state: 'unavailable', reason: 'SHUTTING_DOWN', sqlstate, retryable: true };
  }
  if (/database system is in recovery mode/.test(text)) {
    return { state: 'starting', reason: 'IN_RECOVERY', sqlstate, retryable: true };
  }
  if (/database system is starting up/.test(text) || (sqlstate === '57P03' && !/shutting down/.test(text))) {
    return { state: 'starting', reason: 'STARTING_UP', sqlstate, retryable: true };
  }
  if (chain.some((entry) => entry.code === 'ECONNREFUSED') || /econnrefused/.test(text)) {
    return { state: 'unavailable', reason: 'CONNECTION_REFUSED', sqlstate, retryable: true };
  }
  if (chain.some((entry) => entry.code === 'ETIMEDOUT' || entry.code === 'ECONNRESET') || /timeout|timed out/.test(text)) {
    return { state: 'unavailable', reason: 'TIMEOUT', sqlstate, retryable: true };
  }
  if (sqlstate === '28P01' || sqlstate === '28000' || sqlstate === '3D000') {
    return { state: 'unavailable', reason: 'AUTH_OR_CONFIG', sqlstate, retryable: false };
  }
  return { state: 'unavailable', reason: 'UNKNOWN_ERROR', sqlstate, retryable: false };
}

/** Classify a `pg_isready` exit code (0 accepting, 1 rejecting/starting, 2 no response, 3 no attempt). */
export function classifyPgIsReadyExit(exitCode: number): DatabaseReadinessClassification {
  if (exitCode === 0) return { state: 'healthy', reason: 'OK', sqlstate: null, retryable: false };
  if (exitCode === 1) return { state: 'starting', reason: 'PG_ISREADY_REJECTING', sqlstate: null, retryable: true };
  if (exitCode === 2) return { state: 'unavailable', reason: 'NO_RESPONSE', sqlstate: null, retryable: true };
  return { state: 'unavailable', reason: 'AUTH_OR_CONFIG', sqlstate: null, retryable: false };
}

export const HEALTHY_DATABASE: DatabaseReadinessClassification = {
  state: 'healthy',
  reason: 'OK',
  sqlstate: null,
  retryable: false,
};

/**
 * Only UNAVAILABLE may open an agentic-repair task, and only when the failure is not
 * a known-retryable transient. STARTING and HEALTHY never do.
 */
export function shouldCreateRepairTask(classification: DatabaseReadinessClassification): boolean {
  return classification.state === 'unavailable' && !classification.retryable;
}
