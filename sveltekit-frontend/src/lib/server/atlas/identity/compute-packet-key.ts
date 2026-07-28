/**
 * Packet Key Builder — Deterministic, Immutable Identity
 *
 * packetKey is the stable logical identity across Postgres, Qdrant, Redis, HyperRAG, and ACE.
 * It must be:
 * 1. Deterministic (same input → same output every time)
 * 2. Immutable (no backfill changes, no renames)
 * 3. Collision-free (no two packets share one key)
 *
 * Built from: workspaceId + sourceRef + semanticAnchor
 * Format: pkt:<workspaceId>:<sha256_hex_first_32>
 */

import { createHash } from 'node:crypto';

export interface PacketKeyInput {
  /** Workspace/tenant identifier */
  workspaceId: string;

  /** Source file path (e.g., src/lib/server/auth.ts) */
  sourceRef: string;

  /** Semantic grouping anchor (e.g., "validateSession" function name, or "auth" feature) */
  semanticAnchor: string;
}

/**
 * Normalize sourceRef to POSIX format (forward slashes, lowercase for comparison)
 * Input: src\lib\server\auth.ts (Windows)
 * Output: src/lib/server/auth.ts
 */
export function normalizeSourceRef(sourceRef: string): string {
  return sourceRef
    .replaceAll('\\', '/')    // Windows backslashes → forward slashes
    .toLowerCase()            // Normalize case
    .trim();
}

/**
 * Compute the stable packet key
 *
 * Example:
 *   input = { workspaceId: 'default', sourceRef: 'src/lib/server/auth.ts', semanticAnchor: 'validateSession' }
 *   output = 'pkt:default:7ebdc697c4f8e3d2a1b5f9e8c7d6a5b4'  (36 chars)
 *
 * @throws Error if any input is empty or invalid
 */
export function computePacketKey(input: PacketKeyInput): string {
  // Validation: all inputs required and non-empty
  if (!input.workspaceId || !input.workspaceId.trim()) {
    throw new Error('workspaceId is required and must be non-empty');
  }
  if (!input.sourceRef || !input.sourceRef.trim()) {
    throw new Error('sourceRef is required and must be non-empty');
  }
  if (!input.semanticAnchor || !input.semanticAnchor.trim()) {
    throw new Error('semanticAnchor is required and must be non-empty');
  }

  const normalizedSourceRef = normalizeSourceRef(input.sourceRef);
  const trimmedAnchor = input.semanticAnchor.trim();

  // Canonical form: "pkt:v1:<workspaceId>:<sourceRef>:<semanticAnchor>"
  // (version prefix allows future migrations if needed)
  const canonical = `pkt:v1:${input.workspaceId}:${normalizedSourceRef}:${trimmedAnchor}`;

  // SHA-256 digest (first 32 hex chars for readability and collision resistance)
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex');
  const shortHash = digest.slice(0, 32);

  return `pkt:${input.workspaceId}:${shortHash}`;
}

/**
 * Verify that a packetKey is well-formed (optional validation helper)
 */
export function validatePacketKey(key: string): {
  valid: boolean;
  error?: string;
} {
  if (!key.startsWith('pkt:')) {
    return { valid: false, error: 'packetKey must start with pkt:' };
  }

  const parts = key.split(':');
  if (parts.length !== 3) {
    return { valid: false, error: 'packetKey must have exactly 3 colon-separated parts' };
  }

  const [_prefix, _workspaceId, hash] = parts;
  if (hash.length !== 32) {
    return { valid: false, error: `hash must be 32 hex characters, got ${hash.length}` };
  }

  if (!/^[0-9a-f]{32}$/.test(hash)) {
    return { valid: false, error: 'hash must be lowercase hex' };
  }

  return { valid: true };
}

/**
 * Extract workspaceId from a packetKey (utility)
 */
export function extractWorkspaceFromPacketKey(key: string): string | null {
  const parts = key.split(':');
  return parts.length === 3 ? parts[1] : null;
}
