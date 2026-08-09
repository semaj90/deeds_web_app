/**
 * graph-packet-key-resolver.ts — shared Neo4j CodebaseFile.path -> Postgres
 * atlas_packets.packet_key resolution, factored out of pagerank-analysis-adapter.ts
 * so every graph-analysis adapter (PageRank, Louvain, and future Leiden/
 * CheiRank/k-core/betweenness adapters) joins identity the same way instead
 * of each reinventing it — the exact duplication pattern this whole change
 * exists to stop (see README.md's `PageRankRunSchema` duplication note).
 *
 * Deliberately does NOT use Neo4j's coalesced `stableKey` property
 * (`coalesce(n.stableKey, n.filePath, n.relativePath, n.path, n.name)`) as
 * packet_key directly — root CLAUDE.md's "Forbidden Identity Sources" bans
 * `stable_key`-style legacy pseudo-refs, and a raw Neo4j-derived string was
 * never validated against the actual Postgres identity table. Always resolve
 * through `atlas_packets.source_ref`.
 *
 * Join basis verified live 2026-08-09 against a 2000-node random sample of
 * CodebaseFile.path values containing '/': 1,307 exact + 578
 * 'sveltekit-frontend/'-prefixed matches = 94.25% resolution rate.
 */

import type { Pool } from 'pg';

export async function resolveCodebaseFilePacketKeys(
	db: Pool,
	paths: readonly string[],
): Promise<Map<string, string>> {
	const uniquePaths = [...new Set(paths)];
	const resolved = new Map<string, string>();
	if (uniquePaths.length === 0) return resolved;

	const prefixedPaths = uniquePaths.map((p) => `sveltekit-frontend/${p}`);
	const { rows } = await db.query<{ source_ref: string; packet_key: string }>(
		`SELECT source_ref, packet_key FROM atlas_packets WHERE source_ref = ANY($1) OR source_ref = ANY($2)`,
		[uniquePaths, prefixedPaths],
	);
	for (const row of rows) {
		resolved.set(row.source_ref, row.packet_key);
	}
	return resolved;
}

/** Look up a single path's packet_key from a resolver map, trying the exact then prefixed form. */
export function lookupPacketKey(resolved: Map<string, string>, path: string | null | undefined): string | undefined {
	if (!path) return undefined;
	return resolved.get(path) ?? resolved.get(`sveltekit-frontend/${path}`);
}
