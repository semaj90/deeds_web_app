import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function findRepoRoot(start: string): string {
	let current = resolve(start);
	while (!existsSync(resolve(current, 'package.json')) || !existsSync(resolve(current, '.okf', 'manifest.yaml'))) {
		const parent = dirname(current);
		if (parent === current) throw new Error('Unable to locate repository root');
		current = parent;
	}
	return current;
}

const repoRoot = findRepoRoot(process.cwd());
const pythonOracle = resolve(repoRoot, 'python', 'parent_atlas_networkx_pagerank.py');
const gdsRunner = resolve(repoRoot, 'scripts', 'atlas', 'compute-pagerank-neo4j-v2.mjs');

type Score = { nodeKey: string; pagerankRaw: number };
type Witness = Record<string, number | string>;

function run(command: string, args: string[]): string {
	return execFileSync(command, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function readWitness(): Witness {
	const postgres = JSON.parse(run('docker', [
		'exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-Atc',
		"SELECT json_build_object('row_count', COUNT(*), 'pagerank_score_sum', COALESCE(SUM(pagerank_score),0), 'authority_sum', COALESCE(SUM(authority_score),0), 'page_rank_score_sum', COALESCE(SUM(page_rank_score),0))::text FROM atlas_packets;"
	]));
	const karpathy = run('docker', ['exec', 'legal-ai-valkey', 'valkey-cli', '--no-auth-warning', '-a', 'redis', '--raw', 'HGETALL', 'gpu:karpathy:scores']);
	return {
		...postgres,
		karpathy_sha256: createHash('sha256').update(karpathy).digest('hex'),
		karpathy_field_count: karpathy ? karpathy.split(/\r?\n/).filter(Boolean).length / 2 : 0
	};
}

function l1(scores: readonly Score[]): Map<string, number> {
	const total = scores.reduce((sum, score) => sum + score.pagerankRaw, 0);
	return new Map(scores.map((score) => [score.nodeKey, score.pagerankRaw / total]));
}

function ranks(scores: readonly Score[]): Map<string, number> {
	const ordered = [...scores].sort((a, b) => a.pagerankRaw - b.pagerankRaw || a.nodeKey.localeCompare(b.nodeKey));
	const result = new Map<string, number>();
	for (let start = 0; start < ordered.length;) {
		let end = start + 1;
		while (end < ordered.length && ordered[end].pagerankRaw === ordered[start].pagerankRaw) end += 1;
		const rank = (start + end - 1) / 2 + 1;
		for (let index = start; index < end; index += 1) result.set(ordered[index].nodeKey, rank);
		start = end;
	}
	return result;
}

function spearman(left: readonly Score[], right: readonly Score[]): number {
	const leftRanks = ranks(left);
	const rightRanks = ranks(right);
	const keys = [...leftRanks.keys()];
	const n = keys.length;
	const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
	const xs = keys.map((key) => leftRanks.get(key) ?? 0);
	const ys = keys.map((key) => rightRanks.get(key) ?? 0);
	const xMean = mean(xs);
	const yMean = mean(ys);
	const numerator = xs.reduce((sum, x, index) => sum + (x - xMean) * (ys[index] - yMean), 0);
	const denominator = Math.sqrt(xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0) * ys.reduce((sum, y) => sum + (y - yMean) ** 2, 0));
	return denominator === 0 ? 0 : numerator / denominator;
}

describe('Parent Atlas NetworkX and Neo4j GDS fixture parity', () => {
	it('proves parity without modifying production score surfaces', async () => {
		const before = readWitness();
		const networkx = JSON.parse(run('python', [pythonOracle]));
		expect(networkx.status).toBe('NETWORKX_REFERENCE_PROVEN');

		const gds = JSON.parse(run('node', [gdsRunner, '--json']));
		const after = readWitness();
		expect(after).toEqual(before);

		const runnerSource = await readFile(gdsRunner, 'utf8');
		for (const forbidden of ['atlas_packets', 'authority_score', 'gpu:karpathy:scores', 'codebase_chunks_768', 'gds.pageRank.write', 'gds.pageRank.mutate', 'L1Norm']) {
			expect(runnerSource).not.toContain(forbidden);
		}

		if (gds.status === 'NEO4J_GDS_UNAVAILABLE') {
			console.log(JSON.stringify({
				NETWORKX_REFERENCE_PROVEN: true,
				NEO4J_GDS_UNAVAILABLE: true,
				PAGERANK_PARITY_NOT_RUN: true,
				PRODUCTION_SCORE_UNCHANGED: true,
				OVERALL_LIVE_PARTIAL: true
			}));
			return;
		}

		expect(gds.status).toBe('NEO4J_GDS_PROVEN');
		expect(gds.node_count).toBe(networkx.node_count);
		expect(gds.edge_count).toBe(networkx.edge_count);
		expect(gds.topology_hash).toBe(networkx.topology_hash);
		expect(gds.included_edge_types).toEqual(networkx.included_edge_types);
		expect(gds.excluded_edge_types).toEqual(networkx.excluded_edge_types);

		const gdsScores = gds.scores as Score[];
		const networkxScores = networkx.scores as Score[];
		expect(gdsScores.map((score) => score.nodeKey)).toEqual(networkxScores.map((score) => score.nodeKey));
		const networkxL1 = l1(networkxScores);
		const gdsL1 = l1(gdsScores);
		const maxScoreDelta = Math.max(...networkxScores.map((score) => Math.abs((networkxL1.get(score.nodeKey) ?? 0) - (gdsL1.get(score.nodeKey) ?? 0))));
		const topK = 3;
		const topNetworkx = [...networkxScores].sort((a, b) => b.pagerankRaw - a.pagerankRaw).slice(0, topK).map((score) => score.nodeKey);
		const topGds = [...gdsScores].sort((a, b) => b.pagerankRaw - a.pagerankRaw).slice(0, topK).map((score) => score.nodeKey);
		const topOverlap = topNetworkx.filter((nodeKey) => topGds.includes(nodeKey)).length / topK;

		expect(spearman(networkxScores, gdsScores)).toBeGreaterThanOrEqual(0.99);
		expect(topOverlap).toBe(1);
		expect(maxScoreDelta).toBeLessThanOrEqual(1e-8);
		console.log(JSON.stringify({
			NETWORKX_REFERENCE_PROVEN: true,
			NEO4J_GDS_PROVEN: true,
			PAGERANK_PARITY_PROVEN: true,
			PRODUCTION_SCORE_UNCHANGED: true,
			top_k_overlap: topOverlap,
			spearman_correlation: spearman(networkxScores, gdsScores),
			maximum_score_delta: maxScoreDelta
		}));
	}, 60_000);
});
