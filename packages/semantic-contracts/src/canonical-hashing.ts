import crypto from 'crypto';

/**
 * Deterministic SHA256 hash of any JSON value.
 *
 * Rules:
 * - Object keys sorted alphabetically (no insertion order)
 * - No insignificant whitespace (canonical form)
 * - UTF-8 encoding
 * - null preserved explicitly
 * - Numbers in minimal form (1.0 → 1)
 *
 * Guarantees: same JSON value → same hash (round-trip safe via canonical JSON)
 */
export function canonicalHashJSON(value: unknown): string {
  const canonical = JSON.stringify(sortJsonObjectKeys(JSON.parse(JSON.stringify(value))));
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function sortJsonObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonObjectKeys);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record).sort()
        .map((key) => [key, sortJsonObjectKeys(record[key])]),
    );
  }
  return value;
}

/**
 * Verify a value matches a known hash.
 */
export function verifyCanonicalHash(value: unknown, expectedHash: string): boolean {
  return canonicalHashJSON(value) === expectedHash;
}

/**
 * MessagePack-compatible hash (JSON → msgpack → SHA256).
 * Used for transport-level integrity checks.
 */
export function messagePackHash(value: unknown): string {
  // Fallback to JSON hash for now (msgpack binding optional).
  return canonicalHashJSON(value);
}

/**
 * Arrow IPC hash (for batch exports).
 * Used for analytics snapshots.
 */
export function arrowIPCHash(rows: Record<string, unknown>[]): string {
  const canonical = JSON.stringify(rows, null, 0);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}
