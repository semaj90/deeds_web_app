import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { PageRankParityScoreV2Schema, type PageRankParityScoreV2 } from './pagerank-cross-executor-parity.js';

const PageRankParityScoreFileRowSchema = PageRankParityScoreV2Schema.extend({
	nodeOrdinal: z.number().int().nonnegative(),
}).strict();

export interface PageRankParityScoreSetV2 {
	scores: PageRankParityScoreV2[];
	rawOutputHash: string;
	rowCount: number;
}

/**
 * Load the exact worker NDJSON bytes, preserving the worker's sha256 identity,
 * then project rows to the parity-only key/score shape used by the metric
 * builder. Ordinals must be a unique dense [0,N-1] sequence.
 */
export async function loadPageRankParityScoreFile(path: string): Promise<PageRankParityScoreSetV2> {
	const bytes = await readFile(path);
	const rawOutputHash = createHash('sha256').update(bytes).digest('hex');
	const lines = bytes.toString('utf8').split(/\r?\n/).filter((line) => line.trim().length > 0);
	const rows = lines.map((line) => PageRankParityScoreFileRowSchema.parse(JSON.parse(line)));
	const byOrdinal = [...rows].sort((a, b) => a.nodeOrdinal - b.nodeOrdinal);
	const parityKeys = new Set<string>();
	for (let index = 0; index < byOrdinal.length; index += 1) {
		const row = byOrdinal[index];
		if (row.nodeOrdinal !== index) throw new Error(`PageRank parity score ordinal gap: expected ${index}, got ${row.nodeOrdinal}`);
		if (parityKeys.has(row.parityNodeKey)) throw new Error(`duplicate PageRank parityNodeKey '${row.parityNodeKey}'`);
		parityKeys.add(row.parityNodeKey);
	}
	return {
		scores: byOrdinal.map(({ parityNodeKey, score }) => ({ parityNodeKey, score })),
		rawOutputHash,
		rowCount: byOrdinal.length,
	};
}
