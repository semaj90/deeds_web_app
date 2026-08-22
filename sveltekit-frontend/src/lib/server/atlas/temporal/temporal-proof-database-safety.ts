export type TemporalProofDatabaseSafetyV1 = {
  allowed: boolean;
  reason:
    | 'ALLOWED_EXPLICIT_DISPOSABLE_TARGET'
    | 'EXPLICIT_DISPOSABLE_CONFIRMATION_REQUIRED'
    | 'EXPECTED_DISPOSABLE_DATABASE_REQUIRED'
    | 'DATABASE_URL_REQUIRED'
    | 'DATABASE_URL_INVALID'
    | 'DATABASE_NAME_MISMATCH'
    | 'KNOWN_PROXY_TARGET_REJECTED'
    | 'KNOWN_CANONICAL_DATABASE_REJECTED';
  target: string | null;
  databaseName: string | null;
};

const KNOWN_CANONICAL_DATABASE_NAMES = new Set(['legal_ai_db']);

/**
 * Fail-closed target guard for temporal integration proofs that append/delete
 * throwaway rows. The workstation's 127.0.0.1:5434 endpoint is a proxy to the
 * shared canonical local-dev database and is never a disposable proof target.
 *
 * The canonical database identity is also rejected independently of network
 * route. This prevents bypassing the proxy guard by connecting directly to the
 * Docker address/port for the same database.
 *
 * A boolean opt-in is not enough: the caller must name the disposable database
 * expected in DATABASE_URL. The live proof separately verifies
 * current_database() against that same name before its first write.
 *
 * This guard is intentionally proof-specific; it does not classify deployment
 * roles for production code.
 */
export function classifyTemporalProofDatabaseSafetyV1(input: {
  databaseUrl: string | undefined;
  explicitDisposableConfirmation: boolean;
  expectedDatabaseName: string | undefined;
}): TemporalProofDatabaseSafetyV1 {
  if (!input.explicitDisposableConfirmation) {
    return {
      allowed: false,
      reason: 'EXPLICIT_DISPOSABLE_CONFIRMATION_REQUIRED',
      target: null,
      databaseName: null,
    };
  }

  const expectedDatabaseName = String(input.expectedDatabaseName ?? '').trim().toLowerCase();
  if (!expectedDatabaseName || expectedDatabaseName.includes('/') || expectedDatabaseName.includes('\\')) {
    return {
      allowed: false,
      reason: 'EXPECTED_DISPOSABLE_DATABASE_REQUIRED',
      target: null,
      databaseName: null,
    };
  }

  const raw = String(input.databaseUrl ?? '').trim();
  if (!raw) return { allowed: false, reason: 'DATABASE_URL_REQUIRED', target: null, databaseName: null };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { allowed: false, reason: 'DATABASE_URL_INVALID', target: null, databaseName: null };
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    return { allowed: false, reason: 'DATABASE_URL_INVALID', target: null, databaseName: null };
  }

  const host = parsed.hostname.toLowerCase();
  const port = parsed.port || '5432';
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, '')).trim().toLowerCase();
  } catch {
    return { allowed: false, reason: 'DATABASE_URL_INVALID', target: null, databaseName: null };
  }
  if (!databaseName || databaseName.includes('/')) {
    return { allowed: false, reason: 'DATABASE_URL_INVALID', target: null, databaseName: null };
  }
  const target = `${host}:${port}/${databaseName}`;

  if ((host === '127.0.0.1' || host === 'localhost') && port === '5434') {
    return { allowed: false, reason: 'KNOWN_PROXY_TARGET_REJECTED', target, databaseName };
  }
  if (KNOWN_CANONICAL_DATABASE_NAMES.has(databaseName)) {
    return { allowed: false, reason: 'KNOWN_CANONICAL_DATABASE_REJECTED', target, databaseName };
  }
  if (databaseName !== expectedDatabaseName) {
    return { allowed: false, reason: 'DATABASE_NAME_MISMATCH', target, databaseName };
  }

  return { allowed: true, reason: 'ALLOWED_EXPLICIT_DISPOSABLE_TARGET', target, databaseName };
}
