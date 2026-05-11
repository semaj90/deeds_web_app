/**
 * KAG cluster source — read-side for the SOM-clustered AGENTS DAG.
 *
 * Built by `scripts/agents/som-cluster-cards.mjs` which:
 *   1. Pulls AGENTS cards from CouchDB karpathy_wiki
 *   2. Trains a small SOM (default 6×6) on tag/feature BoW vectors
 *   3. Assigns each card a (somRow, somCol) cell — its BMU
 *   4. Aggregates each cell into a cluster summary (top tags/features, member dirs,
 *      optional Gemma4-summarised text)
 *   5. Writes the DAG to:
 *       - NVMe:  memory/agents-dag/cluster-{R}-{C}.json  (durable cold cache)
 *       - Redis: kag:cluster:agents:{R}-{C}              (TTL 3600s hot cache)
 *       - Redis: kag:cluster:agents:_index               (lookup root for enumeration)
 *
 * This module is the consumer side. Used by ACE prompt assembly to inject a
 * "directory cluster context" block when the user's query maps to one of the
 * dominant SOM cells. Pure read — never writes.
 *
 * Lookup order:
 *   1. Redis `kag:cluster:agents:{R}-{C}` (5ms hot path)
 *   2. NVMe `memory/agents-dag/cluster-{R}-{C}.json` (50ms cold fallback)
 *   3. Returns null if neither tier has the cluster
 *
 * Cluster picking:
 *   - `pickClusterByTags(tags[])`: rank cells by overlap with their topTags
 *   - `pickClusterByQuery(query)`: extract keywords + delegate to pickClusterByTags
 *   - `getClusterContextForQuery(query)`: full ACE-injectable wrapper
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// ── Schema ────────────────────────────────────────────────────────────────────

export const kagClusterNodeSchema = z.object({
	id:           z.string().regex(/^kag:cluster:agents:\d+-\d+$/),
	somRow:       z.number().int().min(0),
	somCol:       z.number().int().min(0),
	memberCount:  z.number().int().min(1),
	memberIds:    z.array(z.string()),
	memberPaths:  z.array(z.string()),
	topTags:      z.array(z.string()),
	topFeatures:  z.array(z.string()),
	summary:      z.string(),
	generatedAt:  z.string(),
});
export type KagClusterNode = z.infer<typeof kagClusterNodeSchema>;

export const kagClusterIndexSchema = z.object({
	grid:        z.object({ rows: z.number().int().min(1), cols: z.number().int().min(1) }),
	cells:       z.array(z.object({ key: z.string(), count: z.number().int().min(1) })),
	generatedAt: z.string(),
});
export type KagClusterIndex = z.infer<typeof kagClusterIndexSchema>;

// ── NVMe path resolver ────────────────────────────────────────────────────────
// Resolves to <repo-root>/sveltekit-frontend/memory/agents-dag/. Lazy because
// the consumer often doesn't need NVMe (Redis hit covers most reads).

let _NVME_DIR: string | null = null;
function nvmeDir(): string {
	if (_NVME_DIR) return _NVME_DIR;
	// Walk up from current working directory; the script is launched from the
	// sveltekit-frontend root in normal use.
	_NVME_DIR = resolve(process.cwd(), 'memory/agents-dag');
	return _NVME_DIR;
}

// ── Redis loader (lazy + tolerant of test envs) ───────────────────────────────

let _getRedis: (() => unknown) | null = null;
async function loadRedis() {
	if (!_getRedis) {
		const mod = await import('$lib/server/redis');
		_getRedis = mod.getRedis;
	}
	return (_getRedis as unknown as () => { get: (k: string) => Promise<string | null> })();
}

// ── Single-cluster read: Redis → NVMe fallback ────────────────────────────────

export async function readClusterById(row: number, col: number): Promise<KagClusterNode | null> {
	const id = `kag:cluster:agents:${row}-${col}`;
	// Tier 1: Redis
	try {
		const redis = await loadRedis();
		const raw = await redis.get(id);
		if (raw) {
			try {
				return kagClusterNodeSchema.parse(JSON.parse(raw));
			} catch {
				// Fall through to NVMe; raw was malformed
			}
		}
	} catch {
		// Redis unavailable — fall through to NVMe
	}
	// Tier 2: NVMe
	const path = resolve(nvmeDir(), `cluster-${row}-${col}.json`);
	if (!existsSync(path)) return null;
	try {
		return kagClusterNodeSchema.parse(JSON.parse(readFileSync(path, 'utf-8')));
	} catch {
		return null;
	}
}

// ── Cluster index (enumeration root) ──────────────────────────────────────────

export async function readClusterIndex(): Promise<KagClusterIndex | null> {
	// Tier 1: Redis
	try {
		const redis = await loadRedis();
		const raw = await redis.get('kag:cluster:agents:_index');
		if (raw) {
			try {
				return kagClusterIndexSchema.parse(JSON.parse(raw));
			} catch {
				// fall through to NVMe
			}
		}
	} catch {
		/* fall through */
	}
	// Tier 2: NVMe
	const path = resolve(nvmeDir(), 'index.json');
	if (!existsSync(path)) return null;
	try {
		const raw = JSON.parse(readFileSync(path, 'utf-8'));
		// NVMe index has a richer shape than the Redis one — extract just what the schema needs
		return kagClusterIndexSchema.parse({
			grid: raw.grid,
			cells: (raw.cells ?? []).map((c: { key: string; count: number }) => ({ key: c.key, count: c.count })),
			generatedAt: raw.generatedAt ?? new Date().toISOString(),
		});
	} catch {
		return null;
	}
}

// ── Cluster picking (tag overlap ranking) ─────────────────────────────────────

export interface ClusterPick {
	row:     number;
	col:     number;
	score:   number;     // 0..1 — overlap rate
	overlap: string[];   // tags shared between query and cluster.topTags
}

export async function pickClusterByTags(tags: readonly string[], topN = 3): Promise<ClusterPick[]> {
	const index = await readClusterIndex();
	if (!index || tags.length === 0) return [];
	const tagSet = new Set(tags.map((t) => t.toLowerCase()));
	const scored: ClusterPick[] = [];

	// Read each populated cell — small N (≤ rows × cols, typically ≤ 36)
	for (const cell of index.cells) {
		const [rStr, cStr] = cell.key.split('-');
		const row = parseInt(rStr, 10);
		const col = parseInt(cStr, 10);
		if (!Number.isFinite(row) || !Number.isFinite(col)) continue;
		const node = await readClusterById(row, col);
		if (!node) continue;
		const overlap = node.topTags.filter((t) => tagSet.has(t.toLowerCase()));
		if (overlap.length === 0) continue;
		const score = overlap.length / Math.max(tags.length, 1);
		scored.push({ row, col, score, overlap });
	}

	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, topN);
}

function extractTagsFromQuery(text: string): string[] {
	const tokens = text.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) ?? [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const t of tokens) {
		if (!seen.has(t)) {
			seen.add(t);
			out.push(t);
			if (out.length >= 12) break;
		}
	}
	return out;
}

export async function pickClusterByQuery(query: string, topN = 3): Promise<ClusterPick[]> {
	return pickClusterByTags(extractTagsFromQuery(query), topN);
}

// ── ACE prompt-injection helper ───────────────────────────────────────────────

export interface KagClusterContext {
	picks:        ClusterPick[];
	clusters:     KagClusterNode[];
	contextBlock: string | null;
	timing:       { totalMs: number };
}

/**
 * Top-level: query → picked clusters → markdown block ready for ACE injection.
 * Returns `contextBlock = null` when no clusters match (caller should NOT inject
 * an empty block — it just adds noise to the prompt).
 *
 * @param query     User query text
 * @param options   topN clusters (default 2), maxMembersPerCluster (default 4)
 */
export async function getClusterContextForQuery(
	query: string,
	options: { topN?: number; maxMembersPerCluster?: number } = {}
): Promise<KagClusterContext> {
	const topN = options.topN ?? 2;
	const maxMembers = options.maxMembersPerCluster ?? 4;
	const t0 = Date.now();

	const picks = await pickClusterByQuery(query, topN);
	const clusters: KagClusterNode[] = [];
	for (const p of picks) {
		const node = await readClusterById(p.row, p.col);
		if (node) clusters.push(node);
	}

	if (clusters.length === 0) {
		return { picks, clusters: [], contextBlock: null, timing: { totalMs: Date.now() - t0 } };
	}

	const lines: string[] = ['### Directory cluster context (KAG SOM)'];
	for (let i = 0; i < clusters.length; i++) {
		const c = clusters[i];
		const p = picks[i];
		lines.push(`- **Cluster ${c.somRow}-${c.somCol}** (${c.memberCount} dirs, overlap=${p.overlap.length} tags, score=${p.score.toFixed(2)})`);
		if (c.topTags.length) lines.push(`    tags: ${c.topTags.slice(0, 6).join(', ')}`);
		if (c.topFeatures.length) lines.push(`    features: ${c.topFeatures.slice(0, 4).join(', ')}`);
		if (c.memberPaths.length) {
			const sample = c.memberPaths.slice(0, maxMembers).join(', ');
			const more = c.memberPaths.length > maxMembers ? ` (+${c.memberPaths.length - maxMembers} more)` : '';
			lines.push(`    dirs: ${sample}${more}`);
		}
	}

	return {
		picks,
		clusters,
		contextBlock: lines.join('\n'),
		timing: { totalMs: Date.now() - t0 },
	};
}