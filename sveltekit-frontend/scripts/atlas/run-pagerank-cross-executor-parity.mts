#!/usr/bin/env node
/**
 * Run one projection/parameter-qualified PageRank parity proof:
 *
 *   GraphProjectionSnapshotV1 + PageRankExecutionPlanV1
 *             │
 *             ├─ shared fabric worker / NEO4J_GDS
 *             └─ shared fabric worker / CUGRAPH (WSL2 RAPIDS)
 *                         │
 *                         ▼
 *          PageRankCrossExecutorProofV1
 *                         │
 *                         ▼
 *          PageRankExecutorQualificationV1
 *
 * This is orchestration only. Algorithm execution remains owned by the one
 * scripts/atlas/run_fabric_benchmark.py worker. A PASS does not mutate runtime
 * policy or write canonical PageRank authority.
 */

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import process from 'node:process';
import { GraphProjectionSnapshotV1Schema } from '../../src/lib/server/graph/graph-projection-snapshot-v1.js';
import { PageRankExecutionPlanV1Schema } from '../../src/lib/server/graph/pagerank-execution-contract.js';
import {
	compilePageRankParityFabricRequests,
	pageRankParityFabricRequestToArgs,
} from '../../src/lib/server/graph/pagerank-gpu-fabric-request.js';
import { loadPageRankParityScoreFile } from '../../src/lib/server/graph/pagerank-parity-score-file.js';
import { buildPageRankCrossExecutorProofV1 } from '../../src/lib/server/graph/pagerank-cross-executor-proof.js';
import { qualifyCugraphFromFrozenParity } from '../../src/lib/server/graph/pagerank-executor-qualification.js';

interface CliArgs {
	planPath: string;
	snapshotPath: string;
	legacyReceiptPath: string;
	outDir?: string;
	topK: number;
}

function parseArgs(argv: readonly string[]): CliArgs {
	let planPath = '';
	let snapshotPath = '';
	let legacyReceiptPath = '';
	let outDir: string | undefined;
	let topK = 50;
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const value = argv[index + 1];
		if (arg === '--plan' && value) { planPath = value; index += 1; continue; }
		if (arg === '--snapshot' && value) { snapshotPath = value; index += 1; continue; }
		if (arg === '--legacy-receipt' && value) { legacyReceiptPath = value; index += 1; continue; }
		if (arg === '--out-dir' && value) { outDir = value; index += 1; continue; }
		if (arg === '--top-k' && value) { topK = Number(value); index += 1; continue; }
	}
	if (!planPath || !snapshotPath || !legacyReceiptPath) {
		throw new Error('Usage: --plan <PageRankExecutionPlanV1.json> --snapshot <GraphProjectionSnapshotV1.json> --legacy-receipt <receipt.json> [--out-dir dir] [--top-k 50]');
	}
	if (!Number.isInteger(topK) || topK <= 0) throw new Error('--top-k must be a positive integer');
	return { planPath: resolve(planPath), snapshotPath: resolve(snapshotPath), legacyReceiptPath: resolve(legacyReceiptPath), outDir, topK };
}

async function readJson(path: string): Promise<unknown> {
	return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

function resolveArtifactPath(snapshotFilePath: string, artifactPath: string): string {
	return isAbsolute(artifactPath) ? artifactPath : resolve(dirname(snapshotFilePath), artifactPath);
}

function toWslPath(windowsPath: string): string {
	const absolute = resolve(windowsPath).replace(/\\/g, '/');
	const match = /^([A-Za-z]):\/(.*)$/.exec(absolute);
	if (!match) throw new Error(`Cannot convert non-Windows path to WSL path: ${windowsPath}`);
	return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function convertWorkerArgsToWsl(args: readonly string[]): string[] {
	const pathFlags = new Set(['--nodes', '--edges', '--scores-out', '--receipt-out']);
	const converted: string[] = [];
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		converted.push(arg);
		if (pathFlags.has(arg) && args[index + 1]) {
			converted.push(toWslPath(args[index + 1]));
			index += 1;
		}
	}
	return converted;
}

function runGdsWorker(workerPath: string, args: string[]): void {
	const python = process.env.ATLAS_GDS_PYTHON ?? 'python';
	execFileSync(python, [workerPath, ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit'],
		maxBuffer: 64 * 1024 * 1024,
		env: process.env,
	});
}

function runCugraphWorker(workerPath: string, args: string[]): void {
	if (process.platform !== 'win32') {
		const python = process.env.ATLAS_RAPIDS_PYTHON ?? 'python';
		execFileSync(python, [workerPath, ...args], {
			encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024, env: process.env,
		});
		return;
	}
	const distro = process.env.ATLAS_WSL_DISTRO ?? 'Ubuntu';
	const python = process.env.ATLAS_RAPIDS_PYTHON ?? '~/miniforge3/envs/atlas-rapids-cu13/bin/python';
	const wslArgs = convertWorkerArgsToWsl(args);
	const command = [python, shellQuote(toWslPath(workerPath)), ...wslArgs.map(shellQuote)].join(' ');
	execFileSync('wsl.exe', ['-d', distro, '--', 'bash', '-lc', command], {
		encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024, env: process.env,
	});
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const plan = PageRankExecutionPlanV1Schema.parse(await readJson(args.planPath));
	const parsedSnapshot = GraphProjectionSnapshotV1Schema.parse(await readJson(args.snapshotPath));
	const snapshot = GraphProjectionSnapshotV1Schema.parse({
		...parsedSnapshot,
		artifactPaths: {
			...parsedSnapshot.artifactPaths,
			nodesParquet: resolveArtifactPath(args.snapshotPath, parsedSnapshot.artifactPaths.nodesParquet),
			edgesParquet: resolveArtifactPath(args.snapshotPath, parsedSnapshot.artifactPaths.edgesParquet),
			manifestJson: resolveArtifactPath(args.snapshotPath, parsedSnapshot.artifactPaths.manifestJson),
		},
	});
	const legacyReceipt = await readJson(args.legacyReceiptPath);
	const outputDir = resolve(args.outDir ?? resolve(dirname(args.snapshotPath), 'pagerank-cross-executor-v2'));
	await mkdir(outputDir, { recursive: true });

	const referenceScoresPath = resolve(outputDir, 'neo4j-gds-scores.ndjson');
	const challengerScoresPath = resolve(outputDir, 'cugraph-scores.ndjson');
	const referenceReceiptPath = resolve(outputDir, 'neo4j-gds-execution-receipt.json');
	const challengerReceiptPath = resolve(outputDir, 'cugraph-execution-receipt.json');
	const proofPath = resolve(outputDir, 'pagerank-cross-executor-proof-v1.json');
	const qualificationPath = resolve(outputDir, 'pagerank-executor-qualification-v1.json');

	const pair = compilePageRankParityFabricRequests({ plan, snapshot });
	const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
	const workerPath = resolve(repoRoot, 'scripts', 'atlas', 'run_fabric_benchmark.py');

	const referenceArgs = [
		...pageRankParityFabricRequestToArgs(pair.reference),
		'--scores-out', referenceScoresPath,
		'--receipt-out', referenceReceiptPath,
	];
	const challengerArgs = [
		...pageRankParityFabricRequestToArgs(pair.challenger),
		'--scores-out', challengerScoresPath,
		'--receipt-out', challengerReceiptPath,
	];

	runGdsWorker(workerPath, referenceArgs);
	runCugraphWorker(workerPath, challengerArgs);

	const referenceExecutionReceipt = await readJson(referenceReceiptPath);
	const challengerExecutionReceipt = await readJson(challengerReceiptPath);
	const referenceScoreSet = await loadPageRankParityScoreFile(referenceScoresPath);
	const challengerScoreSet = await loadPageRankParityScoreFile(challengerScoresPath);
	const proof = buildPageRankCrossExecutorProofV1({
		plan,
		snapshot,
		referenceExecutionReceipt,
		challengerExecutionReceipt,
		referenceScoreSet,
		challengerScoreSet,
		topK: args.topK,
		producerRevision: 'run-pagerank-cross-executor-parity-v1',
	});
	const qualification = qualifyCugraphFromFrozenParity({
		plan,
		snapshot,
		legacyParityReceipt: legacyReceipt,
		canonicalReferenceParityProof: proof,
		producerRevision: 'run-pagerank-cross-executor-parity-v1',
	});

	await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
	await writeFile(qualificationPath, `${JSON.stringify(qualification, null, 2)}\n`, 'utf8');
	console.log(JSON.stringify({
		status: qualification.status,
		parityStatus: proof.parityReceipt.status,
		proofHash: proof.proofHash,
		parameterHash: proof.parameterHash,
		projectionSnapshotHash: proof.projectionSnapshotHash,
		proofPath,
		qualificationPath,
	}, null, 2));
}

main().catch((error) => {
	console.error(error instanceof Error ? error.stack ?? error.message : error);
	process.exitCode = 1;
});
