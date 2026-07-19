/**
 * Qdrant collection alias management + blue/green promotion.
 *
 * Why aliases?
 * - The retrieval adapters currently hard-code collection names ('codebase_chunks_384_hybrid',
 *   'codebase_chunks_384'). Re-indexing requires a code deployment to cut over.
 * - Qdrant aliases are atomic name→collection mappings updated server-side in one API call.
 *   A blue/green swap is: build new collection → verify → call promoteCollectionAlias() → done.
 *   Zero downtime, no code change, instant rollback by re-promoting to the old collection.
 *
 * Alias naming convention:
 *   codebase_live   → whichever 384-dim hybrid collection is currently serving traffic
 *
 * Resolution priority (fallback chain):
 *   1. Qdrant alias lookup (atomic, operator-controlled)
 *   2. Process-level cache (avoids per-request getCollections() call)
 *   3. Collection existence check against hardcoded priority list
 *   4. Env var CODEBASE_QDRANT_COLLECTION
 *   5. First hardcoded name (cold default)
 */

import { getQdrantManager } from '$lib/server/vector/qdrant-manager.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The canonical alias that always points to the serving collection. */
export const CODEBASE_ALIAS = 'codebase_live';

/** Priority-ordered fallback collection names when the alias is absent. */
export const CODEBASE_COLLECTION_PRIORITY = [
  'codebase_chunks_384_hybrid',
  'codebase_chunks_384',
] as const;

export type CanonicalCodebaseCollection = (typeof CODEBASE_COLLECTION_PRIORITY)[number];

/** In-process resolution cache: alias name → { collection, resolvedAt }. */
interface CacheEntry {
  collection: string;
  resolvedAt: number;
}

const CACHE_TTL_MS = 30_000; // 30 s — same order as Qdrant payload index TTL
const resolutionCache = new Map<string, CacheEntry>();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function cacheGet(aliasName: string): string | null {
  const entry = resolutionCache.get(aliasName);
  if (!entry) return null;
  if (Date.now() - entry.resolvedAt > CACHE_TTL_MS) {
    resolutionCache.delete(aliasName);
    return null;
  }
  return entry.collection;
}

function cacheSet(aliasName: string, collection: string): void {
  resolutionCache.set(aliasName, { collection, resolvedAt: Date.now() });
}

/** Invalidate cached resolution for an alias (call after promote). */
export function invalidateAliasCache(aliasName: string = CODEBASE_ALIAS): void {
  resolutionCache.delete(aliasName);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AliasResolutionResult {
  collection: string;
  /** True if resolved via a Qdrant alias; false if fell back to hardcoded list. */
  fromAlias: boolean;
  aliasName: string;
}

/**
 * Resolve an alias name to the underlying Qdrant collection name.
 *
 * Uses an in-process cache (30 s TTL) so the Qdrant round-trip cost is amortised
 * across requests. Cache is invalidated on promote.
 *
 * @param aliasName  Alias to resolve (default: CODEBASE_ALIAS = 'codebase_live')
 */
export async function resolveCollectionViaAlias(
  aliasName: string = CODEBASE_ALIAS,
): Promise<AliasResolutionResult> {
  // 1. In-process cache hit
  const cached = cacheGet(aliasName);
  if (cached) {
    return { collection: cached, fromAlias: true, aliasName };
  }

  const qdrant = getQdrantManager();

  // 2. Qdrant alias lookup
  try {
    const aliasResponse = await (qdrant.client as any).getCollectionAliases(aliasName);
    const aliases: Array<{ alias_name: string; collection_name: string }> =
      aliasResponse?.aliases ?? aliasResponse?.result?.aliases ?? [];

    const match = aliases.find(a => a.alias_name === aliasName);
    if (match?.collection_name) {
      cacheSet(aliasName, match.collection_name);
      return { collection: match.collection_name, fromAlias: true, aliasName };
    }
  } catch {
    // Alias doesn't exist yet or Qdrant is unreachable — fall through
  }

  // 3. Existence-based fallback: pick first collection in priority list that exists
  try {
    const collectionsResponse = await qdrant.getCollections();
    const existingNames = new Set(
      (collectionsResponse.collections ?? [])
        .map((c: { name: string }) => c.name)
        .filter(Boolean),
    );

    for (const name of CODEBASE_COLLECTION_PRIORITY) {
      if (existingNames.has(name)) {
        // Don't cache fallback resolutions — next request should re-attempt alias
        return { collection: name, fromAlias: false, aliasName };
      }
    }
  } catch {
    // Qdrant unavailable
  }

  // 4. Env var override
  const envName = process.env.CODEBASE_QDRANT_COLLECTION?.trim();
  if (envName) {
    return { collection: envName, fromAlias: false, aliasName };
  }

  // 5. Cold default
  return { collection: CODEBASE_COLLECTION_PRIORITY[0], fromAlias: false, aliasName };
}

/**
 * Atomic blue/green promotion: point the alias at a new collection.
 *
 * Safe to call from scripts or operator tooling. The swap is atomic at the
 * Qdrant side — readers that finish their current request against the old
 * collection are unaffected; all new requests after the call will use `targetCollection`.
 *
 * @param targetCollection  The fully-indexed collection to promote to.
 * @param aliasName         Alias to reassign (default: CODEBASE_ALIAS).
 * @param dryRun            If true, validate the target exists but don't promote.
 */
export async function promoteCollectionAlias(
  targetCollection: string,
  aliasName: string = CODEBASE_ALIAS,
  dryRun = false,
): Promise<{ ok: boolean; previous: string | null; current: string; dryRun: boolean; message: string }> {
  const qdrant = getQdrantManager();

  // Verify target collection exists before promoting
  let targetExists = false;
  let previous: string | null = null;

  try {
    const collectionsResponse = await qdrant.getCollections();
    const existingNames = new Set(
      (collectionsResponse.collections ?? [])
        .map((c: { name: string }) => c.name)
        .filter(Boolean),
    );
    targetExists = existingNames.has(targetCollection);
  } catch (err) {
    return {
      ok: false,
      previous: null,
      current: targetCollection,
      dryRun,
      message: `Cannot verify target collection: ${(err as Error).message}`,
    };
  }

  if (!targetExists) {
    return {
      ok: false,
      previous: null,
      current: targetCollection,
      dryRun,
      message: `Target collection '${targetCollection}' does not exist in Qdrant`,
    };
  }

  // Read current alias target (for logging / rollback info)
  try {
    const existing = await resolveCollectionViaAlias(aliasName);
    previous = existing.fromAlias ? existing.collection : null;
  } catch {
    previous = null;
  }

  if (dryRun) {
    return {
      ok: true,
      previous,
      current: targetCollection,
      dryRun: true,
      message: `[dry-run] Would promote alias '${aliasName}' from '${previous ?? '<none>'}' → '${targetCollection}'`,
    };
  }

  // Atomic alias swap
  try {
    await (qdrant.client as any).updateCollectionAliases({
      actions: [
        // Delete the old binding if present, then create the new one.
        // Qdrant processes the action list atomically.
        ...(previous !== null
          ? [{ delete_alias: { alias_name: aliasName } }]
          : []),
        { create_alias: { alias_name: aliasName, collection_name: targetCollection } },
      ],
    });

    // Invalidate local cache so next resolve() picks up the new target immediately
    invalidateAliasCache(aliasName);

    return {
      ok: true,
      previous,
      current: targetCollection,
      dryRun: false,
      message: `Promoted alias '${aliasName}' from '${previous ?? '<none>'}' → '${targetCollection}'`,
    };
  } catch (err) {
    return {
      ok: false,
      previous,
      current: targetCollection,
      dryRun: false,
      message: `Alias update failed: ${(err as Error).message}`,
    };
  }
}

/**
 * List all Qdrant aliases.
 * Useful for operator health checks and `smoke:search-runtime`.
 */
export async function listCollectionAliases(): Promise<
  Array<{ aliasName: string; collectionName: string }>
> {
  const qdrant = getQdrantManager();
  try {
    const response = await (qdrant.client as any).getAliases();
    const raw: Array<{ alias_name: string; collection_name: string }> =
      response?.aliases ?? response?.result?.aliases ?? [];
    return raw.map(a => ({ aliasName: a.alias_name, collectionName: a.collection_name }));
  } catch {
    return [];
  }
}
