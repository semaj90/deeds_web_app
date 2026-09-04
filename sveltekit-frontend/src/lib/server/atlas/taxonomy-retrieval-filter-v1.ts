import { pool } from '$lib/server/db/client.js';

/**
 * TAXONOMY-RETRIEVAL-FILTER-01 — expands a set of taxonomy_nodes.node_key
 * values into the concrete sourceRefs they cover, so retrieval can narrow by
 * taxonomy membership using the *existing* SearchFilter.include_source_refs
 * post-fetch gate (see search-lanes.ts) rather than inventing a new lane.
 * Read-only. Bounded depth/row count per this repo's "no unbounded graph
 * traversal" hard rule (root CLAUDE.md, Parent Atlas Frozen Identity
 * Contract). Not wired to any radix-sort/GPU execution.
 */

const MAX_INPUT_NODE_KEYS = 50;
const MAX_TRAVERSAL_DEPTH = 8; // taxonomy_nodes has 5 levels (0..4) live; headroom, not unbounded
const MAX_RESOLVED_SOURCE_REFS = 2000;

/**
 * taxonomy_nodes leaf (level 4, "file") node_keys are observed live as
 * `file:file:<path>:<symbol>` — a double "file:" prefix baked into the
 * existing populator, not introduced here. Strips any number of leading
 * "file:" segments, then the trailing `:<symbol>` (paths in this repo never
 * contain a colon, so splitting at the last colon is safe).
 */
export function sourceRefFromTaxonomyLeafNodeKeyV1(nodeKey: string): string | null {
  const stripped = nodeKey.replace(/^(?:file:)+/, '');
  if (!stripped || stripped === nodeKey) return null;
  const withoutSymbol = stripped.replace(/:[^:]*$/, '');
  return withoutSymbol.trim() || null;
}

export interface TaxonomyRetrievalFilterResultV1 {
  requestedNodeKeys: string[];
  resolvedSourceRefs: string[];
  resolvedNodeCount: number;
  truncated: boolean;
}

/**
 * Walks DOWN from each requested node_key via taxonomy_nodes.parent_key
 * (bounded depth), collects level-4 ("file") descendants, and parses each
 * into a sourceRef. Returns [] (not an error) when nothing resolves — an
 * empty include_source_refs is a legitimate "match nothing" filter, not a
 * failure.
 */
export async function resolveTaxonomyNodeKeysToSourceRefsV1(
  nodeKeys: readonly string[],
): Promise<TaxonomyRetrievalFilterResultV1> {
  const requested = [...new Set(nodeKeys.map((k) => k.trim()).filter(Boolean))].slice(0, MAX_INPUT_NODE_KEYS);
  if (requested.length === 0) {
    return { requestedNodeKeys: [], resolvedSourceRefs: [], resolvedNodeCount: 0, truncated: false };
  }

  const { rows } = await pool.query<{ node_key: string; level: number }>(
    `WITH RECURSIVE down AS (
       SELECT node_key, level, parent_key, 0 AS depth
         FROM taxonomy_nodes
        WHERE node_key = ANY($1)
       UNION ALL
       SELECT n.node_key, n.level, n.parent_key, down.depth + 1
         FROM taxonomy_nodes n
         JOIN down ON n.parent_key = down.node_key
        WHERE down.depth < $2
     )
     SELECT node_key, level FROM down WHERE level = 4
     LIMIT $3`,
    [requested, MAX_TRAVERSAL_DEPTH, MAX_RESOLVED_SOURCE_REFS + 1],
  );

  const truncated = rows.length > MAX_RESOLVED_SOURCE_REFS;
  const bounded = truncated ? rows.slice(0, MAX_RESOLVED_SOURCE_REFS) : rows;

  const sourceRefs = new Set<string>();
  for (const row of bounded) {
    const sourceRef = sourceRefFromTaxonomyLeafNodeKeyV1(row.node_key);
    if (sourceRef) sourceRefs.add(sourceRef);
  }

  return {
    requestedNodeKeys: requested,
    resolvedSourceRefs: [...sourceRefs],
    resolvedNodeCount: bounded.length,
    truncated,
  };
}
