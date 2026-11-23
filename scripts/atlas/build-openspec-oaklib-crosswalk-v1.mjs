#!/usr/bin/env node
/**
 * OakLib OpenSpec Taskboard Crosswalk & Read-Only Source-Revision Manifest (v1)
 *
 * Implements Priority 3 (Steps 6-7) read-only:
 * - Scans ALL `openspec/changes/<change>/tasks.md` files (excluding archive).
 * - Mint change-qualified identities (`<change>:<taskId>`) so bare task IDs
 *   like `SCENE-01` never collide across changes, keeping `#Lnn` as locator only.
 * - Cross-checks PostgreSQL 18 `codebase_chunk_index` source_revision readiness
 *   (read-only, never lifts Phase 20 deferral or writes to Postgres).
 *
 * Output: docs/reports/openspec-oaklib-identity-revision-manifest-v1.json
 */

import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const require = createRequire(resolve(repoRoot, 'sveltekit-frontend/package.json'));
const pg = require('pg');

const OPENSPEC_DIR = resolve(repoRoot, 'openspec/changes');
const OUT_PATH = resolve(repoRoot, 'docs/reports/openspec-oaklib-identity-revision-manifest-v1.json');

const TASK_RE = /^\s*-\s*\[([ ~xX])\]\s*(.+)$/;
const ID_RE = /\b([A-Z][A-Z0-9_-]{2,}(?:-[A-Za-z0-9]+)*)\b/;

function scanOpenSpecTaskboard() {
	const changes = [];
	const bareIdCollisions = new Map();
	let totalTasks = 0;

	for (const entry of readdirSync(OPENSPEC_DIR)) {
		if (entry === 'archive') continue;
		const changeDir = resolve(OPENSPEC_DIR, entry);
		if (!statSync(changeDir).isDirectory()) continue;
		const tasksPath = resolve(changeDir, 'tasks.md');
		try {
			if (!statSync(tasksPath).isFile()) continue;
		} catch {
			continue;
		}

		const lines = readFileSync(tasksPath, 'utf8').split(/\r?\n/);
		let done = 0;
		let partial = 0;
		let open = 0;
		const sampleQualifiedKeys = [];

		for (let i = 0; i < lines.length; i++) {
			const m = TASK_RE.exec(lines[i]);
			if (!m) continue;
			const status = m[1].toLowerCase();
			const raw = m[2].replaceAll('**', '').trim();
			if (status === 'x') done++;
			else if (status === '~') partial++;
			else open++;
			totalTasks++;

			const idMatch = ID_RE.exec(raw);
			const bareId = idMatch ? idMatch[1] : `LINE-${i + 1}`;
			const qualifiedIdentity = `${entry}:${bareId}`;
			const locator = `openspec/changes/${entry}/tasks.md#L${i + 1}`;

			if (!bareIdCollisions.has(bareId)) bareIdCollisions.set(bareId, new Set());
			bareIdCollisions.get(bareId).add(entry);

			if (sampleQualifiedKeys.length < 5) {
				sampleQualifiedKeys.push({ qualifiedIdentity, locator, status: status === 'x' ? 'DONE' : status === '~' ? 'PARTIAL' : 'OPEN' });
			}
		}

		changes.push({
			changeId: entry,
			total: done + partial + open,
			done,
			partial,
			open,
			sampleQualifiedKeys
		});
	}

	const ambiguousBareIds = [...bareIdCollisions.entries()]
		.filter(([, set]) => set.size > 1)
		.map(([bareId, set]) => ({ bareId, changes: [...set].sort() }))
		.sort((a, b) => b.changes.length - a.changes.length || a.bareId.localeCompare(b.bareId));

	return {
		changeCount: changes.length,
		totalTasks,
		ambiguousBareIdCount: ambiguousBareIds.length,
		topAmbiguousBareIds: ambiguousBareIds.slice(0, 15),
		changes: changes.sort((a, b) => b.open + b.partial - (a.open + a.partial))
	};
}

async function readPostgresRevisionQualification() {
	const connectionString =
		process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
	const client = new pg.Client({ connectionString });
	await client.connect();
	try {
		const res = await client.query(`
			SELECT
				count(*)::int AS total_chunks,
				count(content_embedding_768)::int AS embedded_768_chunks
			FROM codebase_chunk_index
		`);
		return {
			connected: true,
			readOnly: true,
			phase20DeferralActive: true,
			revisionQualified: 'NOT_PROVEN',
			chunkCounts: res.rows[0]
		};
	} finally {
		await client.end();
	}
}

async function main() {
	const taskboard = scanOpenSpecTaskboard();
	let postgres;
	try {
		postgres = await readPostgresRevisionQualification();
	} catch (err) {
		postgres = { connected: false, error: err instanceof Error ? err.message : String(err) };
	}

	const body = {
		schema: 'atlas.openspec-oaklib-identity-revision-manifest.v1',
		writesPerformed: false,
		canonicalAuthority: false,
		identityPolicy: 'CHANGE_QUALIFIED_ID_REQUIRED (<change>:<taskId>, #Lnn locator only)',
		taskboardSummary: {
			changeCount: taskboard.changeCount,
			totalTasks: taskboard.totalTasks,
			ambiguousBareIdCount: taskboard.ambiguousBareIdCount,
			topAmbiguousBareIds: taskboard.topAmbiguousBareIds
		},
		topChangesByRemainingWork: taskboard.changes.slice(0, 12),
		postgresRevisionShadowCheck: postgres
	};

	const manifestSha256 = createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex');
	const report = { ...body, manifestSha256 };

	mkdirSync(resolve(repoRoot, 'docs/reports'), { recursive: true });
	writeFileSync(OUT_PATH, JSON.stringify(report, null, 2), 'utf8');

	console.log(
		JSON.stringify(
			{
				wrote: 'docs/reports/openspec-oaklib-identity-revision-manifest-v1.json',
				changeCount: taskboard.changeCount,
				totalTasks: taskboard.totalTasks,
				ambiguousBareIdCount: taskboard.ambiguousBareIdCount,
				phase20DeferralActive: postgres.phase20DeferralActive,
				manifestSha256
			},
			null,
			2
		)
	);
}

main();
