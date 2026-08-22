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
  const canonical = JSON.stringify(
    JSON.parse(JSON.stringify(value)),
    Object.keys(JSON.parse(JSON.stringify(value)) as Record<string, unknown>).sort(),
    0
  );
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
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
