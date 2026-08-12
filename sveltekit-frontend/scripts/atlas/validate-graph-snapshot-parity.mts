#!/usr/bin/env node
/**
 * GRAPH_SNAPSHOT_PARITY validator.
 *
 * Without --manifest: emits a structured BLOCKED template (shape-only check).
 *
 * With --manifest: builds a real receipt from the frozen nodes.parquet /
 * edges.parquet artifact next to the manifest.
 *   --run-networkx  runs python/graph_snapshot_parity_networkx_oracle.py directly
 *                   (this Windows host has networkx installed).
 *   --run-cugraph   shells into WSL2's atlas-rapids-cu13 conda env to run
 *                   python/graph_snapshot_parity_cugraph_oracle.py — RAPIDS/cuGraph
 *                   requires a CUDA Linux environment and does not run on Windows.
 *
 * When both backends run:
 *  - PageRank scores are compared directly (top-K overlap, Spearman
 *    correlation, max L1-normalized delta) from real per-node scores.
 *  - Louvain partitions are compared by an exact gpu_node_id join (requiring
 *    both backends produced a row for every node, no duplicates) and a real
 *    Adjusted Rand Index / Normalized Mutual Information computation —
 *    never by comparing raw community-count or modularity numbers alone,
 *    since label IDs are arbitrary and Louvain itself is order/randomness
 *    sensitive.
 *
 * Governance: each oracle reports its own status as EXECUTED (it ran
 * successfully), never PROVEN. Only this file — after actually joining and
 * comparing both backends' output — is allowed to populate the pagerank and
 * louvainCommunityAgreement fields with real numbers. An oracle deciding for
 * itself that cross-backend parity holds would be exactly the kind of
 * self-promoted, unverified claim this repo's CLAUDE.md prohibits.
 */

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import {
	buildGraphSnapshotParityReceipt,
	GraphSnapshotParityArtifactPathsSchema,
	GraphSnapshotParityBackendSummarySchema,
	GraphSnapshotParityManifestSchema
} from '../../src/lib/server/atlas/graph/graph-snapshot-parity-contract.js';

type CliArgs = {
	manifestPath?: string;
	runNetworkx?: boolean;
	runCugraph?: boolean;
};

function parseArgs(argv: readonly string[]): CliArgs {
	const result: CliArgs = {};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === '--manifest' && argv[index + 1]) {
			result.manifestPath = argv[index + 1];
			index += 1;
			continue;
		}
		if (arg === '--run-networkx') {
			result.runNetworkx = true;
			continue;
		}
		if (arg === '--run-cugraph') {
			result.runCugraph = true;
		}
	}
	return result;
}

type BackendSummary = ReturnType<typeof GraphSnapshotParityBackendSummarySchema.parse>;
type OracleResult = {
	backend: string;
	status: 'EXECUTED' | 'SKIP' | 'UNAVAILABLE';
	nodeCount: number;
	edgeCount: number;
	componentCount: number;
	louvainModularity: number | null;
	louvainCommunityCount: number | null;
};

function toWslPath(windowsPath: string): string {
	const absolute = resolve(windowsPath).replace(/\\/g, '/');
	const match = /^([A-Za-z]):\/(.*)$/.exec(absolute);
	if (!match) throw new Error(`Cannot convert to WSL path: ${windowsPath}`);
	return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

function runNetworkxOracle(nodesParquetPath: string, edgesParquetPath: string, scoresOutPath: string, louvainOutPath: string): OracleResult {
	const repoRoot = resolve(dirname(import.meta.dirname), '..', '..');
	const oraclePath = resolve(repoRoot, 'python', 'graph_snapshot_parity_networkx_oracle.py');
	const output = execFileSync(
		'python',
		[oraclePath, '--nodes', nodesParquetPath, '--edges', edgesParquetPath, '--scores-out', scoresOutPath, '--louvain-out', louvainOutPath],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }
	);
	return JSON.parse(output.trim()) as OracleResult;
}

function runCugraphOracle(nodesParquetPath: string, edgesParquetPath: string, scoresOutPath: string, louvainOutPath: string): OracleResult {
	const repoRoot = resolve(dirname(import.meta.dirname), '..', '..');
	const oraclePath = resolve(repoRoot, 'python', 'graph_snapshot_parity_cugraph_oracle.py');
	// atlas-rapids-cu13 is the WSL2 miniforge env with RAPIDS installed for this
	// project (see parent-atlas-workstation-todo.md for the cuBLAS/cuGraph
	// version-skew fix this depended on). RAPIDS requires a CUDA Linux
	// environment — there is no Windows-native path.
	const rapidsPython = '~/miniforge3/envs/atlas-rapids-cu13/bin/python';
	const output = execFileSync(
		'wsl.exe',
		[
			'-d', 'Ubuntu', '--',
			'bash', '-lc',
			`${rapidsPython} ${toWslPath(oraclePath)} --nodes ${toWslPath(nodesParquetPath)} --edges ${toWslPath(edgesParquetPath)} --scores-out ${toWslPath(scoresOutPath)} --louvain-out ${toWslPath(louvainOutPath)}`
		],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }
	);
	return JSON.parse(output.trim()) as OracleResult;
}

async function readScoresNdjson(path: string): Promise<Map<number, number>> {
	const scores = new Map<number, number>();
	const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
	for await (const line of rl) {
		if (!line.trim()) continue;
		const row = JSON.parse(line) as { gpuNodeId: number; pagerankRaw: number };
		scores.set(row.gpuNodeId, row.pagerankRaw);
	}
	return scores;
}

type LabelReadResult = { labels: Map<number, number>; duplicateIds: number };

async function readLabelsNdjson(path: string): Promise<LabelReadResult> {
	const labels = new Map<number, number>();
	let duplicateIds = 0;
	const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
	for await (const line of rl) {
		if (!line.trim()) continue;
		const row = JSON.parse(line) as { gpuNodeId: number; communityId: number };
		if (labels.has(row.gpuNodeId)) duplicateIds += 1;
		labels.set(row.gpuNodeId, row.communityId);
	}
	return { labels, duplicateIds };
}

function spearmanCorrelation(a: Map<number, number>, b: Map<number, number>): number {
	const keys = [...a.keys()].filter((key) => b.has(key));
	const rank = (entries: readonly [number, number][]): Map<number, number> => {
		const ordered = [...entries].sort((left, right) => left[1] - right[1]);
		const ranks = new Map<number, number>();
		for (let index = 0; index < ordered.length; ) {
			let end = index + 1;
			while (end < ordered.length && ordered[end][1] === ordered[index][1]) end += 1;
			const averageRank = (index + end - 1) / 2 + 1;
			for (let cursor = index; cursor < end; cursor += 1) ranks.set(ordered[cursor][0], averageRank);
			index = end;
		}
		return ranks;
	};
	if (keys.length === 0) return 0;
	const aEntries: [number, number][] = keys.map((key) => [key, a.get(key) as number]);
	const bEntries: [number, number][] = keys.map((key) => [key, b.get(key) as number]);
	const aRankMap = rank(aEntries);
	const bRankMap = rank(bEntries);
	const xs = keys.map((key) => aRankMap.get(key) ?? 0);
	const ys = keys.map((key) => bRankMap.get(key) ?? 0);
	const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
	const xMean = mean(xs);
	const yMean = mean(ys);
	const numerator = xs.reduce((sum, x, i) => sum + (x - xMean) * (ys[i] - yMean), 0);
	const denominator = Math.sqrt(xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0) * ys.reduce((sum, y) => sum + (y - yMean) ** 2, 0));
	return denominator === 0 ? 0 : numerator / denominator;
}

function topKOverlap(a: Map<number, number>, b: Map<number, number>, k: number): number {
	const top = (scores: Map<number, number>) =>
		[...scores.entries()].sort((left, right) => right[1] - left[1]).slice(0, k).map(([id]) => id);
	const topA = new Set(top(a));
	const topB = top(b);
	if (topB.length === 0) return 0;
	const overlap = topB.filter((id) => topA.has(id)).length;
	return overlap / topB.length;
}

function maxL1NormalizedDelta(a: Map<number, number>, b: Map<number, number>): number {
	const l1 = (scores: Map<number, number>) => {
		const total = [...scores.values()].reduce((sum, value) => sum + value, 0);
		return new Map([...scores.entries()].map(([id, value]) => [id, total === 0 ? 0 : value / total]));
	};
	const aNorm = l1(a);
	const bNorm = l1(b);
	const keys = new Set([...aNorm.keys(), ...bNorm.keys()]);
	let max = 0;
	for (const key of keys) {
		const delta = Math.abs((aNorm.get(key) ?? 0) - (bNorm.get(key) ?? 0));
		if (delta > max) max = delta;
	}
	return max;
}

function comb2(n: number): number {
	return (n * (n - 1)) / 2;
}

/** Adjusted Rand Index + Normalized Mutual Information (arithmetic-mean
 * normalization, matching sklearn's default) between two partitions of the
 * SAME node set, joined by gpuNodeId. Both are label-invariant — arbitrary
 * community ID numbering on either side does not affect the result, which
 * is the whole point: Louvain's own labels are not directly comparable. */
function partitionAgreement(a: Map<number, number>, b: Map<number, number>): { ari: number; nmi: number; communityCountA: number; communityCountB: number } {
	const keys = [...a.keys()].filter((key) => b.has(key));
	const n = keys.length;
	const contingency = new Map<string, number>();
	const rowCounts = new Map<number, number>();
	const colCounts = new Map<number, number>();
	for (const key of keys) {
		const la = a.get(key) as number;
		const lb = b.get(key) as number;
		const cellKey = `${la}:${lb}`;
		contingency.set(cellKey, (contingency.get(cellKey) ?? 0) + 1);
		rowCounts.set(la, (rowCounts.get(la) ?? 0) + 1);
		colCounts.set(lb, (colCounts.get(lb) ?? 0) + 1);
	}

	let sumCombNij = 0;
	for (const count of contingency.values()) sumCombNij += comb2(count);
	let sumCombAi = 0;
	for (const count of rowCounts.values()) sumCombAi += comb2(count);
	let sumCombBj = 0;
	for (const count of colCounts.values()) sumCombBj += comb2(count);
	const totalComb = comb2(n);
	const expectedIndex = totalComb === 0 ? 0 : (sumCombAi * sumCombBj) / totalComb;
	const maxIndex = 0.5 * (sumCombAi + sumCombBj);
	const ari = maxIndex === expectedIndex ? 1 : (sumCombNij - expectedIndex) / (maxIndex - expectedIndex);

	let mi = 0;
	for (const [cellKey, nij] of contingency) {
		const [laStr, lbStr] = cellKey.split(':');
		const ai = rowCounts.get(Number(laStr)) as number;
		const bj = colCounts.get(Number(lbStr)) as number;
		mi += (nij / n) * Math.log((nij * n) / (ai * bj));
	}
	let hA = 0;
	for (const count of rowCounts.values()) {
		const p = count / n;
		hA -= p * Math.log(p);
	}
	let hB = 0;
	for (const count of colCounts.values()) {
		const p = count / n;
		hB -= p * Math.log(p);
	}
	const nmi = hA + hB === 0 ? 1 : (2 * mi) / (hA + hB);

	return { ari, nmi, communityCountA: rowCounts.size, communityCountB: colCounts.size };
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));

	if (!args.manifestPath) {
		const template = buildGraphSnapshotParityReceipt({
			graphRevision: 'graph-revision-placeholder',
			artifactPaths: { nodesParquet: 'nodes.parquet', edgesParquet: 'edges.parquet', manifestJson: 'manifest.json' },
			manifest: GraphSnapshotParityManifestSchema.parse({
				graphRevision: 'graph-revision-placeholder',
				nodeCount: 0,
				edgeCount: 0,
				producerRevision: 'validate-graph-snapshot-parity.stub',
				nodeTableHash: 'pending',
				edgeTableHash: 'pending',
				identityContractVersion: 'graph-snapshot-parity-v1',
				projectionRevision: 'projection-pending'
			}),
			networkx: GraphSnapshotParityBackendSummarySchema.parse({ backend: 'networkx', status: 'SKIP', nodeCount: 0, edgeCount: 0 }),
			cugraph: GraphSnapshotParityBackendSummarySchema.parse({ backend: 'cugraph', status: 'SKIP', nodeCount: 0, edgeCount: 0 }),
			componentCount: 0,
			pagerankTopKOverlap: 0,
			pagerankCorrelation: 0,
			pagerankMaxDelta: 0,
			louvainCommunityAgreement: 0,
			excludedNodeCount: 0,
			excludedEdgeCount: 0,
			unresolvedCount: 0,
			status: 'BLOCKED',
			notes: 'Provide --manifest to validate a frozen parity artifact.'
		});
		process.stdout.write(`${JSON.stringify(template, null, 2)}\n`);
		return;
	}

	const manifest = GraphSnapshotParityManifestSchema.parse(JSON.parse(await readFile(args.manifestPath, 'utf8')));
	const manifestDir = dirname(resolve(args.manifestPath));
	const nodesParquetPath = resolve(manifestDir, 'nodes.parquet');
	const edgesParquetPath = resolve(manifestDir, 'edges.parquet');
	const networkxScoresPath = resolve(manifestDir, 'networkx-scores.ndjson');
	const cugraphScoresPath = resolve(manifestDir, 'cugraph-scores.ndjson');
	const networkxLouvainPath = resolve(manifestDir, 'networkx-louvain.ndjson');
	const cugraphLouvainPath = resolve(manifestDir, 'cugraph-louvain.ndjson');

	const artifactPaths = GraphSnapshotParityArtifactPathsSchema.parse({
		nodesParquet: nodesParquetPath,
		edgesParquet: edgesParquetPath,
		manifestJson: args.manifestPath
	});

	let networkxSummary: BackendSummary = GraphSnapshotParityBackendSummarySchema.parse({
		backend: 'networkx',
		status: 'SKIP',
		nodeCount: manifest.nodeCount,
		edgeCount: manifest.edgeCount
	});
	let cugraphSummary: BackendSummary = GraphSnapshotParityBackendSummarySchema.parse({
		backend: 'cugraph',
		status: 'UNAVAILABLE',
		nodeCount: manifest.nodeCount,
		edgeCount: manifest.edgeCount
	});

	// executed-but-not-yet-cross-backend-proven Louvain outcomes from each
	// oracle, kept separate from the Zod backend summary (which only tracks
	// pagerank/component structural facts) — modularity/communityCount here
	// are single-backend facts, not the parity claim.
	let networkxLouvain: { modularity: number | null; communityCount: number | null } = { modularity: null, communityCount: null };
	let cugraphLouvain: { modularity: number | null; communityCount: number | null } = { modularity: null, communityCount: null };

	if (args.runNetworkx) {
		const oracle = runNetworkxOracle(nodesParquetPath, edgesParquetPath, networkxScoresPath, networkxLouvainPath);
		networkxSummary = GraphSnapshotParityBackendSummarySchema.parse({
			backend: 'networkx',
			status: oracle.status === 'EXECUTED' ? 'PROVEN' : oracle.status === 'SKIP' ? 'SKIP' : 'FAILED',
			nodeCount: oracle.nodeCount,
			edgeCount: oracle.edgeCount,
			componentCount: oracle.componentCount
		});
		networkxLouvain = { modularity: oracle.louvainModularity, communityCount: oracle.louvainCommunityCount };
	}
	if (args.runCugraph) {
		const oracle = runCugraphOracle(nodesParquetPath, edgesParquetPath, cugraphScoresPath, cugraphLouvainPath);
		cugraphSummary = GraphSnapshotParityBackendSummarySchema.parse({
			backend: 'cugraph',
			status: oracle.status === 'EXECUTED' ? 'PROVEN' : oracle.status === 'SKIP' ? 'SKIP' : 'FAILED',
			nodeCount: oracle.nodeCount,
			edgeCount: oracle.edgeCount,
			componentCount: oracle.componentCount
		});
		cugraphLouvain = { modularity: oracle.louvainModularity, communityCount: oracle.louvainCommunityCount };
	}

	let pagerankTopKOverlap = 0;
	let pagerankCorrelation = 0;
	let pagerankMaxDelta = 0;
	let louvainCommunityAgreement = 0;
	let notes: string;

	if (networkxSummary.status === 'PROVEN' && cugraphSummary.status === 'PROVEN') {
		const [networkxScores, cugraphScores] = await Promise.all([
			readScoresNdjson(networkxScoresPath),
			readScoresNdjson(cugraphScoresPath)
		]);
		pagerankTopKOverlap = topKOverlap(networkxScores, cugraphScores, Math.min(50, networkxScores.size));
		pagerankCorrelation = spearmanCorrelation(networkxScores, cugraphScores);
		pagerankMaxDelta = maxL1NormalizedDelta(networkxScores, cugraphScores);

		const notesParts = [
			`Both backends executed live from the frozen parquet artifact. componentCount agreement: ${networkxSummary.componentCount === cugraphSummary.componentCount ? 'exact match' : 'DISAGREE'} (networkx=${networkxSummary.componentCount}, cugraph=${cugraphSummary.componentCount}).`,
			`pagerank top-${Math.min(50, networkxScores.size)} overlap/correlation/maxDelta computed from real per-node scores from both backends.`
		];

		const [networkxRead, cugraphRead] = await Promise.all([
			readLabelsNdjson(networkxLouvainPath).catch(() => null),
			readLabelsNdjson(cugraphLouvainPath).catch(() => null)
		]);

		if (!networkxRead || !cugraphRead) {
			notesParts.push('louvainCommunityAgreement NOT_EVALUATED — one or both --louvain-out files missing (oracle run without Louvain output).');
		} else if (
			networkxRead.labels.size !== manifest.nodeCount ||
			cugraphRead.labels.size !== manifest.nodeCount ||
			networkxRead.duplicateIds !== 0 ||
			cugraphRead.duplicateIds !== 0
		) {
			notesParts.push(
				`louvainCommunityAgreement NOT_EVALUATED — exact-join precondition failed (required nodeCount=${manifest.nodeCount} each with 0 duplicates; got networkx rows=${networkxRead.labels.size} dup=${networkxRead.duplicateIds}, cugraph rows=${cugraphRead.labels.size} dup=${cugraphRead.duplicateIds}).`
			);
		} else {
			const agreement = partitionAgreement(networkxRead.labels, cugraphRead.labels);
			// ARI is theoretically in [-1, 1] (negative = worse than random); the
			// contract field is bounded [0, 1]. Clamp and say so rather than
			// silently losing information or violating the schema.
			const clampedAri = Math.max(0, Math.min(1, agreement.ari));
			louvainCommunityAgreement = clampedAri;
			notesParts.push(
				`Louvain partition agreement computed via exact gpu_node_id join (${manifest.nodeCount} nodes, 0 missing, 0 duplicates on both sides): ARI=${agreement.ari.toFixed(6)}${clampedAri !== agreement.ari ? ' (clamped to [0,1] for the schema field)' : ''}, NMI=${agreement.nmi.toFixed(6)}. Community counts: networkx=${agreement.communityCountA}, cugraph=${agreement.communityCountB}. Modularity: networkx=${networkxLouvain.modularity ?? 'n/a'}, cugraph=${cugraphLouvain.modularity ?? 'n/a'}. Both backends ran LOUVAIN_PARITY_PROJECTION_V1 (undirected, weight='weight', resolution=1.0, threshold=1e-7, max_level=100, self-loops dropped).`
			);
		}

		notes = notesParts.join(' ');
	} else if (networkxSummary.status === 'PROVEN') {
		notes = 'NetworkX backend executed live from the frozen parquet artifact. cuGraph backend not run this pass (pass --run-cugraph). pagerank/louvain cross-backend fields are unset until both backends run.';
	} else if (cugraphSummary.status === 'PROVEN') {
		notes = 'cuGraph backend executed live from the frozen parquet artifact. NetworkX backend not run this pass (pass --run-networkx). pagerank/louvain cross-backend fields are unset until both backends run.';
	} else {
		notes = 'Pass --run-networkx and/or --run-cugraph to execute the live oracles against the frozen parquet artifact.';
	}

	const componentCount = networkxSummary.componentCount ?? cugraphSummary.componentCount ?? 0;

	const receipt = buildGraphSnapshotParityReceipt({
		graphRevision: manifest.graphRevision,
		artifactPaths,
		manifest,
		networkx: networkxSummary,
		cugraph: cugraphSummary,
		componentCount,
		pagerankTopKOverlap,
		pagerankCorrelation,
		pagerankMaxDelta,
		louvainCommunityAgreement,
		excludedNodeCount: 0,
		excludedEdgeCount: 0,
		unresolvedCount: 0,
		notes
	});

	process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.stack ?? error.message : String(error));
	process.exitCode = 1;
});
