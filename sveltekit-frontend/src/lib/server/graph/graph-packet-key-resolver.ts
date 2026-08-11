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

function normalizeAtlasPath(path: string): string {
	return String(path)
		.replace(/\\/g, '/')
		.replace(/^\.?\//, '')
		.replace(/^\.claude\/worktrees\/[^/]+\//, '')
		.replace(/^sveltekit-frontend\//, '')
		.replace(/^src\//, '');
}

export type GraphPacketResolutionKind = 'canonical' | 'excluded' | 'unresolved';

export interface GraphPacketPathResolution {
	kind: GraphPacketResolutionKind;
	normalizedPath: string;
	reason?: string;
}

function isGraphPacketPathExcluded(path: string): string | null {
	const normalized = normalizeAtlasPath(path);
	if (!normalized) return 'empty-path';
	if (/^(?:.*\/)?(?:AGENTS|LLMS)\.md$/i.test(normalized)) return 'policy-document';
	if (/\.(?:bak|backup)$/i.test(normalized)) return 'shadow-backup';
	if (/^\.claude\/worktrees\/[^/]+\//.test(String(path).replace(/\\/g, '/'))) return 'worktree-shadow';
	return null;
}

function pathVariants(path: string): string[] {
	const normalized = normalizeAtlasPath(path);
	const srcPrefixed = `src/${normalized}`;
	const frontendPrefixed = `sveltekit-frontend/${normalized}`;
	const worktreePrefixed = `.claude/worktrees/current/${normalized}`;
	return [...new Set([path, normalized, srcPrefixed, frontendPrefixed, worktreePrefixed].map((value) => String(value).replace(/\\/g, '/').replace(/^\.?\//, ''))) ];
}

export function classifyGraphPacketPath(path: string): GraphPacketPathResolution {
	const normalizedPath = normalizeAtlasPath(path);
	const exclusionReason = isGraphPacketPathExcluded(path);
	if (exclusionReason) {
		return { kind: 'excluded', normalizedPath, reason: exclusionReason };
	}
	if (!normalizedPath) {
		return { kind: 'unresolved', normalizedPath, reason: 'empty-path' };
	}
	return { kind: 'canonical', normalizedPath };
}

export async function resolveCodebaseFilePacketKeys(
	db: Pool,
	paths: readonly string[],
): Promise<Map<string, string>> {
	const uniquePaths = [...new Set(paths.flatMap((path) => pathVariants(path)))];
	const resolved = new Map<string, string>();
	if (uniquePaths.length === 0) return resolved;

	const { rows } = await db.query<{ source_ref: string; packet_key: string }>(
		`SELECT source_ref, canonical_source_ref, file_path, source_path, source_ref_key, packet_key
		 FROM atlas_packets
		 WHERE source_ref = ANY($1)
		    OR canonical_source_ref = ANY($1)
		    OR file_path = ANY($1)
		    OR source_path = ANY($1)
		    OR source_ref_key = ANY($1)
		`,
		[uniquePaths],
	);
	for (const row of rows) {
		for (const key of [
			row.source_ref,
			row.canonical_source_ref,
			row.file_path,
			row.source_path,
			row.source_ref_key,
		]) {
			if (key) resolved.set(normalizeAtlasPath(key), row.packet_key);
		}
	}
	return resolved;
}

/** Look up a single path's packet_key from a resolver map, trying the exact then prefixed form. */
export function lookupPacketKey(resolved: Map<string, string>, path: string | null | undefined): string | undefined {
	if (!path) return undefined;
	const variants = pathVariants(path);
	for (const variant of variants) {
		const packetKey = resolved.get(normalizeAtlasPath(variant));
		if (packetKey) return packetKey;
	}
	return undefined;
}
