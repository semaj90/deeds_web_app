#!/usr/bin/env node
/**
 * Graph dispatcher proof reporter.
 *
 * Captures the live dispatcher registry plus the latest Louvain persistence
 * and unresolved-seed receipts into a durable JSON proof artifact.
 */

import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { buildGraphDispatcherProofSnapshot } from '../../src/lib/server/graph/graph-dispatcher-proof.ts';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'graph-dispatcher-proof.json');

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

async function writeJson(reportPath: string, value: unknown): Promise<void> {
	await mkdir(path.dirname(reportPath), { recursive: true });
	await writeFile(reportPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
	const dryRun = hasFlag('--dry-run');
	const reportPath = readFlagValue('--report', DEFAULT_REPORT_JSON) ?? DEFAULT_REPORT_JSON;

	if (dryRun) {
		const report = {
			receiptKind: 'GRAPH_DISPATCHER_AND_LOUVAIN_PROVEN',
			status: 'BLOCKED',
			notes: 'Dry-run template; no database connection attempted.',
			reportPath,
			generatedAt: new Date().toISOString(),
		};
		await writeJson(reportPath, report);
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		return;
	}

	const pool = new Pool({
		host: process.env.POSTGRES_HOST ?? '127.0.0.1',
		port: Number(process.env.POSTGRES_PORT ?? 5434),
		user: process.env.POSTGRES_USER ?? 'legal_admin',
		password: process.env.POSTGRES_PASSWORD ?? '123456',
		database: process.env.POSTGRES_DB ?? 'legal_ai_db',
	});

	try {
		const snapshot = await buildGraphDispatcherProofSnapshot(pool);
		const receipt = {
			receiptKind: 'GRAPH_DISPATCHER_AND_LOUVAIN_PROVEN',
			status: snapshot.openGaps.length === 0 ? 'PROVEN' : 'PARTIAL',
			reportPath,
			generatedAt: snapshot.generatedAt,
			registry: snapshot.registry,
			louvainReceipt: snapshot.louvainReceipt,
			louvainResolutionReceipt: snapshot.louvainResolutionReceipt,
			openGaps: snapshot.openGaps,
		};
		await writeJson(reportPath, receipt);
		process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
	} finally {
		await pool.end().catch(() => {});
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.stack ?? error.message : String(error));
	process.exitCode = 1;
});
