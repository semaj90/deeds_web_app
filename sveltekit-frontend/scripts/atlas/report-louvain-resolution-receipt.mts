#!/usr/bin/env node
/**
 * Live Louvain resolution receipt reporter.
 *
 * Read-only. Emits a JSON report for the latest succeeded Louvain run and
 * its unresolved-seed classification receipt. In dry-run mode, it writes a
 * blocked template instead of touching the database.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
	buildGraphDispatcherProofSnapshot,
} from '../../src/lib/server/graph/graph-dispatcher-proof.js';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'louvain-resolution-receipt.json');

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
			receiptKind: 'LOUVAIN_UNRESOLVED_KEY_CLASSIFICATION_PROVEN',
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
		const receipt = snapshot.louvainResolutionReceipt;
		const compact = receipt
			? {
				inputUnresolvedCount: receipt.inputUnresolvedCount,
				inputUnresolvedSetHash: receipt.inputUnresolvedSetHash,
				totalRows: receipt.totalRows,
				resolvedRows: receipt.resolvedRows,
				approvedExcludedRows: receipt.approvedExcludedRows,
				blockingRows: receipt.blockingRows,
				bucketCounts: receipt.bucketCounts,
				ambiguousRows: receipt.ambiguousRows,
				provenanceInsufficientRows: receipt.provenanceInsufficientRows,
				unclassifiedRows: receipt.unclassifiedRows,
				replaySafe: receipt.replaySafe,
			}
			: {
				inputUnresolvedCount: 0,
				inputUnresolvedSetHash: '',
				totalRows: 0,
				resolvedRows: 0,
				approvedExcludedRows: 0,
				blockingRows: 0,
				bucketCounts: {
					RESOLVED_EXISTING_RULE: 0,
					AMBIGUOUS_MATCH: 0,
					NO_PACKET_ROW: 0,
					DIFFERENT_GRAIN: 0,
					STALE_PROJECTION: 0,
					PROVENANCE_INSUFFICIENT: 0,
					MALFORMED_LEGACY_PATH: 0,
					EXCLUDED_PATH: 0,
				},
				ambiguousRows: 0,
				provenanceInsufficientRows: 0,
				unclassifiedRows: 0,
				replaySafe: false,
			};
		const report = {
			receiptKind: 'LOUVAIN_UNRESOLVED_KEY_CLASSIFICATION_PROVEN',
			status: snapshot.louvainResolutionReceipt?.replaySafe ? 'PROVEN' : 'PARTIAL',
			reportPath,
			generatedAt: snapshot.generatedAt,
			graphDispatcherProofSnapshot: snapshot,
		};
		await writeJson(reportPath, report);
		process.stdout.write(`${JSON.stringify(compact, null, 2)}\n`);
	} finally {
		await pool.end().catch(() => {});
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.stack ?? error.message : String(error));
	process.exitCode = 1;
});
