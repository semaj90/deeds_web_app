#!/usr/bin/env node
/**
 * Collection Guard — Safeguard Against Degraded/Legacy Collections
 *
 * Prevents accidental mutation of:
 * - Legacy `codebase_chunks_768` (proven dense, not sparse-ready)
 * - Any collection outside the allowlist
 *
 * Only permits:
 * - `codebase_chunks_768_v2` (clean v2 dense, approved for sparse experiments)
 * - `codebase_chunks_sparse_test_*` (bounded test collections)
 * - `codebase_chunks_hybrid_*` (migration staging)
 */

const FORBIDDEN_COLLECTIONS = new Set([
  'codebase_chunks_768',  // Legacy, proven issue root
  'codebase_chunks_384',  // Old semantic lane
  'codebase_chunks_64'    // Old latent lane
]);

const ALLOWED_COLLECTION_PREFIXES = [
  'codebase_chunks_768_v2',           // Clean v2 production
  'codebase_chunks_sparse_test_',     // Bounded proof tests
  'codebase_chunks_hybrid_'           // Full migration staging
];

export function assertSafeCollection(collection) {
  if (typeof collection !== 'string' || !collection.trim()) {
    throw new Error(`Invalid collection name: "${collection}" (must be non-empty string)`);
  }

  if (FORBIDDEN_COLLECTIONS.has(collection)) {
    throw new Error(
      `Refusing to target degraded/legacy collection: "${collection}"\n` +
      `This collection is FORBIDDEN for sparse experiments.\n` +
      `Allowed: ${ALLOWED_COLLECTION_PREFIXES.join(', ')}`
    );
  }

  const isAllowed = ALLOWED_COLLECTION_PREFIXES.some(prefix => collection.startsWith(prefix));
  if (!isAllowed) {
    throw new Error(
      `Collection "${collection}" is outside the sparse migration allowlist.\n` +
      `Allowed prefixes: ${ALLOWED_COLLECTION_PREFIXES.join(', ')}`
    );
  }
}

export function assertApplyConditions(options = {}) {
  const { apply = false, dryRun = false, limit = null, corpusRevision = null, representationRevision = null } = options;

  if (apply && dryRun) {
    throw new Error('Cannot use both --apply and --dry-run simultaneously');
  }

  if (apply && !corpusRevision) {
    throw new Error('--apply requires --corpus-revision (frozen state hash)');
  }

  if (apply && !representationRevision) {
    throw new Error('--apply requires --representation-revision (e.g., lexical_v1)');
  }

  if (apply && !limit) {
    console.warn('⚠️  WARNING: --apply without --limit will process ALL records. Confirm with --force');
  }

  return { apply, dryRun, limit, corpusRevision, representationRevision };
}
