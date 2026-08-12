#!/usr/bin/env node
import 'dotenv/config';
/**
 * Seed the Louvain unresolved-key ledger from the latest successful live run.
 *
 * This does not rerun Louvain. It reads the existing Neo4j louvainCommunity
 * annotations, resolves them against atlas_packets, and writes only the
 * unresolved reconciliation tail into graph_community_resolution_seeds.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { getNeo4jDriver } from '../../src/lib/server/neo4j-driver.js';
import { prepareLouvainResolutionSeeds } from '../../src/lib/server/graph/louvain-resolution-seeder.js';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'louvain-resolution-seed.json');

function hasFlag(name: string): boolean {
	return process.argv.includes(name);
}

function readFlagValue(name: string, fallback?: string): string | undefined {
	const index = process.argv.findIndex((arg) => arg === name || arg.startsWith(`${name}=`));
	if (index < 0) return fallback;
	const current = process.argv[index];
	if (current.includes('=')) return current.split('=', 2)[1];
	return process.argv[index + 1] ?? fallback;
}

function hashRows(rows: Array<{ graphNodeKey: string; rawPath: string; communityId: string }>): string {
	const canonicalRows = [...rows]
		.map((row) => ({
			graphNodeKey: row.graphNodeKey,
			rawPath: row.rawPath,
			communityId: row.communityId,
		}))
		.sort((a, b) => {
			const left = `${a.graphNodeKey}\u0000${a.rawPath}\u0000${a.communityId}`;
			const right = `${b.graphNodeKey}\u0000${b.rawPath}\u0000${b.communityId}`;
			return left.localeCompare(right);
		});
	return createHash('sha256').update(JSON.stringify(canonicalRows)).digest('hex');
}

async function writeJson(reportPath: string, value: unknown): Promise<void> {
	await mkdir(path.dirname(reportPath), { recursive: true });
	await writeFile(reportPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
	const dryRun = hasFlag('--dry-run');
	const reportPath = readFlagValue('--report', DEFAULT_REPORT_JSON) ?? DEFAULT_REPORT_JSON;

	const pool = new Pool({
		host: process.env.POSTGRES_HOST ?? '127.0.0.1',
		port: Number(process.env.POSTGRES_PORT ?? 5434),
		user: process.env.POSTGRES_USER ?? 'legal_admin',
		password: process.env.POSTGRES_PASSWORD ?? '123456',
		database: process.env.POSTGRES_DB ?? 'legal_ai_db',
	});

	const driver = getNeo4jDriver();
	const session = driver.session();
	try {
		console.error('[seed-louvain] locating latest succeeded Louvain run');
		const { rows: runRows } = await pool.query<{
			run_id: string;
			projection_name: string;
			graph_revision: string;
			metrics: { unresolvedPacketKeys?: number; excludedPacketKeys?: number; assignments?: number } | null;
		}>(`
			SELECT run_id, projection_name, graph_revision, metrics
			FROM graph_analysis_runs
			WHERE algorithm = 'louvain' AND status = 'succeeded'
			ORDER BY started_at DESC
			LIMIT 1
		`);
		const run = runRows[0];
		if (!run) {
			throw new Error('No succeeded Louvain run found');
		}

		console.error('[seed-louvain] reading live CodebaseFile Louvain nodes');
		const { records } = await session.run(`
			MATCH (n:CodebaseFile)
			WHERE n.louvainCommunity IS NOT NULL AND n.path IS NOT NULL
			RETURN n.path AS path, toString(n.louvainCommunity) AS community_id
			ORDER BY n.path
		`);
		const sourceRows = records
			.map((record) => ({
				graphNodeKey: String(record.get('path') ?? ''),
				rawPath: String(record.get('path') ?? ''),
				communityId: String(record.get('community_id') ?? ''),
			}))
			.filter((row) => row.graphNodeKey.length > 0 && row.rawPath.length > 0 && row.communityId.length > 0);

		console.error(`[seed-louvain] preparing seeds from ${sourceRows.length} live graph rows`);
		const plan = await prepareLouvainResolutionSeeds(pool, sourceRows, run.graph_revision);
		const insertedRows = plan.unresolvedSeeds.length;

		if (!dryRun && insertedRows > 0) {
			console.error(`[seed-louvain] inserting ${insertedRows} unresolved seed rows`);
			const seedValues: string[] = [];
			const seedParams: unknown[] = [];
			plan.unresolvedSeeds.forEach((seed, index) => {
				const base = index * 7;
				seedValues.push(`($${base + 1}::uuid, $${base + 2}::text, $${base + 3}::text, $${base + 4}::text, $${base + 5}::text, $${base + 6}::text, $${base + 7}::text)`);
				seedParams.push(
					run.run_id,
					'louvain',
					seed.graphNodeKey,
					seed.rawPath,
					seed.normalizedPath,
					seed.communityId,
					seed.graphRevision,
				);
			});

			await pool.query(
				`INSERT INTO graph_community_resolution_seeds
					(run_id, algorithm, graph_node_key, raw_path, normalized_path, community_id, graph_revision)
				 VALUES ${seedValues.join(',\n')}
				 ON CONFLICT (run_id, graph_node_key) DO UPDATE SET
				   algorithm = EXCLUDED.algorithm,
				   raw_path = EXCLUDED.raw_path,
				   normalized_path = EXCLUDED.normalized_path,
				   community_id = EXCLUDED.community_id,
				   graph_revision = EXCLUDED.graph_revision,
				   created_at = now()`,
				seedParams,
			);
		}

		console.error('[seed-louvain] writing summary report');
		const report = {
			receiptKind: 'LOUVAIN_UNRESOLVED_KEY_SEEDING',
			status: dryRun ? 'DRY_RUN' : 'COMPLETE',
			runId: run.run_id,
			projectionName: run.projection_name,
			graphRevision: run.graph_revision,
			inputUnresolvedCount: plan.unresolvedRows,
			inputUnresolvedSetHash: hashRows(plan.unresolvedSeeds),
			resolvedRows: plan.resolvedRows,
			approvedExcludedRows: plan.excludedRows,
			blockingRows: plan.unresolvedRows,
			insertedRows,
			reportPath,
			generatedAt: new Date().toISOString(),
		};

		await writeJson(reportPath, report);
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	} finally {
		await session.close().catch(() => {});
		await pool.end().catch(() => {});
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.stack ?? error.message : String(error));
	process.exitCode = 1;
});
