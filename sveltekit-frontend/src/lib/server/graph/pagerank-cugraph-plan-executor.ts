import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { join } from 'node:path';
import {
	PageRankExecutionPlanV1Schema,
	PageRankExecutionReceiptV1Schema,
	assertPageRankPlanProjection,
	type PageRankExecutionPlanV1,
	type PageRankExecutionReceiptV1,
} from './pagerank-execution-contract.js';
import { GraphProjectionSnapshotV1Schema, type GraphProjectionSnapshotV1 } from './graph-projection-snapshot-v1.js';
import { assertPageRankDispatchable } from './pagerank-dispatch-policy.js';

export interface RawOrdinalPageRankScoreV1 {
	nodeOrdinal: number;
	score: number;
}

export interface CugraphPageRankPlanExecutionV1 {
	scores: RawOrdinalPageRankScoreV1[];
	receipt: PageRankExecutionReceiptV1;
	projectionSnapshotHash: string;
}

type CugraphExecutorSummary = {
	status: 'EXECUTED';
	executorId: 'CUGRAPH';
	nodeCount: number;
	relationshipCount: number;
	convergenceStatus: 'CONVERGED' | 'NON_CONVERGED' | 'UNKNOWN';
	ranIterations: null;
	failOnNonconvergence: boolean;
	readMillis: number;
	graphBuildMillis: number;
	computeMillis: number;
	rawOutputHash: string;
};

function toWslPath(path: string): string {
	const absolute = resolve(path).replace(/\\/g, '/');
	const match = /^([A-Za-z]):\/(.*)$/.exec(absolute);
	if (!match) throw new Error(`Cannot convert non-Windows path to WSL path: ${path}`);
	return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function runCugraphExecutor(args: string[]): string {
	if (process.platform !== 'win32') {
		const python = process.env.ATLAS_RAPIDS_PYTHON ?? 'python';
		return execFileSync(python, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	}
	const python = process.env.ATLAS_RAPIDS_PYTHON ?? '~/miniforge3/envs/atlas-rapids-cu13/bin/python';
	const command = [python, ...args.map(shellQuote)].join(' ');
	return execFileSync(
		'wsl.exe',
		['-d', process.env.ATLAS_WSL_DISTRO ?? 'Ubuntu', '--', 'bash', '-lc', command],
		{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
	);
}

async function parseScores(path: string): Promise<RawOrdinalPageRankScoreV1[]> {
	const content = await readFile(path, 'utf8');
	const rows = content
		.split(/\r?\n/)
		.filter(Boolean)
		.map((line) => JSON.parse(line) as RawOrdinalPageRankScoreV1)
		.sort((a, b) => a.nodeOrdinal - b.nodeOrdinal);
	for (let index = 0; index < rows.length; index += 1) {
		const row = rows[index];
		if (row.nodeOrdinal !== index) throw new Error(`cuGraph score ordinal gap: expected ${index}, got ${row.nodeOrdinal}`);
		if (!Number.isFinite(row.score) || row.score < 0) throw new Error(`invalid cuGraph PageRank score at ordinal ${row.nodeOrdinal}`);
	}
	return rows;
}

export async function executeCugraphPageRankPlan(input: {
	plan: unknown;
	snapshot: unknown;
}): Promise<CugraphPageRankPlanExecutionV1> {
	const plan = PageRankExecutionPlanV1Schema.parse(input.plan);
	const snapshot = GraphProjectionSnapshotV1Schema.parse(input.snapshot);
	assertPageRankDispatchable(plan);
	assertPageRankPlanProjection(plan, snapshot.projection);
	if (plan.executor.executorId !== 'CUGRAPH') throw new Error(`cuGraph executor requires CUGRAPH, got ${plan.executor.executorId}`);
	if (plan.executor.role !== 'GPU_CHALLENGER') throw new Error('cuGraph remains GPU_CHALLENGER until canonical parity qualification passes');
	if (plan.algorithm !== 'pagerank' || plan.parameters.personalization.mode !== 'GLOBAL') {
		throw new Error('cuGraph snapshot executor currently supports global PageRank only; PPR requires proven canonical seed identity in the parquet snapshot');
	}

	const tempDir = await mkdtemp(join(tmpdir(), 'atlas-cugraph-pagerank-'));
	const scoresPath = join(tempDir, 'scores.ndjson');
	try {
		const repoScriptPath =
			process.env.ATLAS_CUGRAPH_PAGERANK_EXECUTOR ??
			resolve(dirname(import.meta.filename), '../../../../../python/pagerank_projection_cugraph_executor.py');
		const nativeArgs = [
			repoScriptPath,
			'--nodes', snapshot.artifactPaths.nodesParquet,
			'--edges', snapshot.artifactPaths.edgesParquet,
			'--relationship-types-json', JSON.stringify(plan.parameters.relationshipTypes),
			'--damping', String(plan.parameters.dampingFactor),
			'--max-iterations', String(plan.parameters.maxIterations),
			'--tolerance', String(plan.parameters.tolerance),
			'--scores-out', scoresPath,
			...(plan.parameters.weighted ? ['--weighted'] : []),
		];
		const runtimeArgs = process.platform === 'win32'
			? nativeArgs.map((arg, index) => index === 0 || [2, 4, 14].includes(index) ? toWslPath(arg) : arg)
			: nativeArgs;
		const stdout = runCugraphExecutor(runtimeArgs);
		const summary = JSON.parse(stdout.trim()) as CugraphExecutorSummary;
		if (summary.status !== 'EXECUTED' || summary.executorId !== 'CUGRAPH') throw new Error('cuGraph executor did not return an EXECUTED summary');
		if (summary.nodeCount !== snapshot.projection.nodeCount) {
			throw new Error(`cuGraph nodeCount mismatch: expected ${snapshot.projection.nodeCount}, got ${summary.nodeCount}`);
		}
		const scores = await parseScores(scoresPath);
		if (scores.length !== summary.nodeCount) throw new Error(`cuGraph score count mismatch: expected ${summary.nodeCount}, got ${scores.length}`);

		const receipt = PageRankExecutionReceiptV1Schema.parse({
			schema: 'atlas.pagerank-execution-receipt.v1',
			runId: plan.runId,
			algorithmFamily: plan.algorithmFamily,
			algorithm: plan.algorithm,
			algorithmRevision: plan.algorithmRevision,
			graphRevision: snapshot.projection.graphRevision,
			projectionRevision: snapshot.projection.projectionRevision,
			projectionHash: snapshot.projection.projectionHash,
			projectionName: snapshot.projection.projectionName,
			nodeCount: summary.nodeCount,
			relationshipCount: summary.relationshipCount,
			telemetry: {
				executorId: 'CUGRAPH',
				convergenceStatus: summary.convergenceStatus,
				ranIterations: null,
				failOnNonconvergence: summary.failOnNonconvergence,
				atlasMeasuredMillis: summary.readMillis + summary.graphBuildMillis + summary.computeMillis,
			},
			rawOutputHash: summary.rawOutputHash,
			producerRevision: plan.producerRevision,
			completedAt: new Date().toISOString(),
		});
		return { scores, receipt, projectionSnapshotHash: snapshot.contentHash };
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}
