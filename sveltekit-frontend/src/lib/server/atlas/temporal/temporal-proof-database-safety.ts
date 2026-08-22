export type TemporalProofDatabaseSafetyV1 = {
  allowed: boolean;
  reason:
    | 'ALLOWED_EXPLICIT_DISPOSABLE_TARGET'
    | 'EXPLICIT_DISPOSABLE_CONFIRMATION_REQUIRED'
    | 'DATABASE_URL_REQUIRED'
    | 'DATABASE_URL_INVALID'
    | 'KNOWN_PROXY_TARGET_REJECTED'
    | 'KNOWN_CANONICAL_DATABASE_REJECTED';
  target: string | null;
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
 * This guard is intentionally proof-specific; it does not classify deployment
 * roles for production code.
 */
export function classifyTemporalProofDatabaseSafetyV1(input: {
  databaseUrl: string | undefined;
  explicitDisposableConfirmation: boolean;
}): TemporalProofDatabaseSafetyV1 {
  if (!input.explicitDisposableConfirmation) {
    return { allowed: false, reason: 'EXPLICIT_DISPOSABLE_CONFIRMATION_REQUIRED', target: null };
  }
  const raw = String(input.databaseUrl ?? '').trim();
  if (!raw) return { allowed: false, reason: 'DATABASE_URL_REQUIRED', target: null };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { allowed: false, reason: 'DATABASE_URL_INVALID', target: null };
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    return { allowed: false, reason: 'DATABASE_URL_INVALID', target: null };
  }

  const host = parsed.hostname.toLowerCase();
  const port = parsed.port || '5432';
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, '')).trim().toLowerCase();
  if (!databaseName) {
    return { allowed: false, reason: 'DATABASE_URL_INVALID', target: null };
  }
  const target = `${host}:${port}/${databaseName}`;

  if ((host === '127.0.0.1' || host === 'localhost') && port === '5434') {
    return { allowed: false, reason: 'KNOWN_PROXY_TARGET_REJECTED', target };
  }
  if (KNOWN_CANONICAL_DATABASE_NAMES.has(databaseName)) {
    return { allowed: false, reason: 'KNOWN_CANONICAL_DATABASE_REJECTED', target };
  }

  return { allowed: true, reason: 'ALLOWED_EXPLICIT_DISPOSABLE_TARGET', target };
}
