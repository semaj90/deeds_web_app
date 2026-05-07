#!/usr/bin/env node
// analyze-wiki-gaps.mjs
//
// Detects the 4 canonical ACE retrieval gaps, writes wiki cards, caches in Redis,
// optionally syncs to Neo4j and CouchDB.
//
// Usage:
//   node scripts/wiki/analyze-wiki-gaps.mjs
//   node scripts/wiki/analyze-wiki-gaps.mjs --dry-run
//   node scripts/wiki/analyze-wiki-gaps.mjs --no-redis --no-neo4j
//   node scripts/wiki/analyze-wiki-gaps.mjs --no-couchdb

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..'); // sveltekit-frontend/
const SRC_ROOT = resolve(ROOT, 'src');
const LOGS_DIR = resolve(ROOT, 'logs/wiki');

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_REDIS = process.argv.includes('--no-redis');
const SKIP_NEO4J = process.argv.includes('--no-neo4j');
const SKIP_COUCHDB = process.argv.includes('--no-couchdb');
const QUIET = process.argv.includes('--quiet');

function log(...args) {
	if (!QUIET) console.log('[wiki:gaps]', ...args);
}

function err(...args) {
	console.error('[wiki:gaps:ERR]', ...args);
}

// ── Load server modules via inline import (avoids Vite/SvelteKit)
// We import from the compiled source directly using tsx-like resolution.
// For scripts context: use a minimal Redis client directly.

async function analyzeGaps() {
	// Step 1: Static gap analysis (pure file reads, no network)
	log('Step 1 — running static gap checks...');

	const gapDefs = [
		{
			id: 'gap_ace_001',
			title: 'multiLaneSearch not called by context-assembler',
			severity: 'HIGH',
			check: async () => {
				const { readFile } = await import('node:fs/promises');
				const assembler = await readFile(
					resolve(SRC_ROOT, 'lib/server/ace/context-assembler.ts'),
					'utf8'
				).catch(() => '');
				const hasImport =
					assembler.includes('multiLaneSearch') ||
					assembler.includes('multi-lane-retrieval');
				return {
					open: !hasImport,
					evidence: hasImport
						? 'multiLaneSearch import found in context-assembler.ts'
						: 'No multiLaneSearch import or call in context-assembler.ts',
				};
			},
			summary:
				'context-assembler.ts has no import or call to multiLaneSearch() from multi-lane-retrieval.ts.',
			why:
				'The multi-lane retrieval system exists but is bypassed. Error fingerprint cache hits, ' +
				'ngram recall, and graph node expansion are never surfaced to Gemma4.',
			patch:
				'In context-assembler.ts: import { multiLaneSearch } from ./multi-lane-retrieval.js; ' +
				'call in parallel with Qdrant lane; merge synthesisBlock into context string.',
			affectedFiles: [
				'src/lib/server/ace/context-assembler.ts',
				'src/lib/server/ace/multi-lane-retrieval.ts',
			],
			affectedSymbols: ['multiLaneSearch', 'assembleACEContext'],
			affectedRedisKeys: ['ace:topk:*:embeddinggemma:768'],
		},
		{
			id: 'gap_ace_002',
			title: 'skipVectorLane declared but never enforced in multiLaneSearch',
			severity: 'HIGH',
			check: async () => {
				const { readFile } = await import('node:fs/promises');
				const mlr = await readFile(
					resolve(SRC_ROOT, 'lib/server/ace/multi-lane-retrieval.ts'),
					'utf8'
				).catch(() => '');
				const hasEnforcement =
					mlr.includes('if (query.skipVectorLane)') ||
					mlr.includes('skipVectorLane &&') ||
					mlr.includes('!query.skipVectorLane');
				return {
					open: !hasEnforcement,
					evidence: hasEnforcement
						? 'skipVectorLane is enforced in multiLaneSearch body'
						: 'skipVectorLane declared but not enforced — always runs all lanes',
				};
			},
			summary:
				'MultiLaneQuery.skipVectorLane is typed but multiLaneSearch() always runs all lanes regardless.',
			why:
				'Callers cannot opt out of expensive vector lanes. The flag exists for cost control but has no effect.',
			patch:
				'In multiLaneSearch(): check query.skipVectorLane before pushing vector-only lane results. ' +
				'hash/ngram/ace_cache lanes should still run when skipVectorLane=true.',
			affectedFiles: ['src/lib/server/ace/multi-lane-retrieval.ts'],
			affectedSymbols: ['multiLaneSearch', 'skipVectorLane'],
			affectedRedisKeys: [],
		},
		{
			id: 'gap_ace_003',
			title: 'ace:topk writer/reader key namespace has no shared constant',
			severity: 'HIGH',
			check: async () => {
				const { readFile } = await import('node:fs/promises');
				try {
					const ck = await readFile(
						resolve(SRC_ROOT, 'lib/server/ace/cache-keys.ts'),
						'utf8'
					);
					const ok = ck.includes('aceTopkKey') || ck.includes('ace:topk');
					return {
						open: !ok,
						evidence: ok
							? 'aceTopkKey constant found in cache-keys.ts'
							: 'cache-keys.ts exists but aceTopkKey not defined',
					};
				} catch {
					return { open: true, evidence: 'src/lib/server/ace/cache-keys.ts does not exist' };
				}
			},
			summary:
				'context-assembler.ts writes ace:topk:{queryHash}:embeddinggemma:768; multi-lane-retrieval.ts reads the same pattern. ' +
				'No shared constant — format drift causes silent 100% cache miss.',
			why: 'A model name or hash length change breaks the cache with no error, only silent latency regression.',
			patch:
				'Create src/lib/server/ace/cache-keys.ts with: ' +
				'export const aceTopkKey = (qh, model="embeddinggemma", dim=768) => `ace:topk:${qh}:${model}:${dim}`; ' +
				'Import in both files.',
			affectedFiles: [
				'src/lib/server/ace/context-assembler.ts',
				'src/lib/server/ace/multi-lane-retrieval.ts',
			],
			affectedSymbols: ['aceTopkKey'],
			affectedRedisKeys: ['ace:topk:*:embeddinggemma:768'],
		},
		{
			id: 'gap_ace_004',
			title: 'error_fingerprints Postgres table lacks backfill pipeline from tsgo diagnostics',
			severity: 'MED',
			check: async () => {
				const { readFile } = await import('node:fs/promises');
				try {
					await readFile(
						resolve(ROOT, '../scripts/wiki/backfill-error-fingerprints.mjs'),
						'utf8'
					);
					return { open: false, evidence: 'backfill-error-fingerprints.mjs exists' };
				} catch {
					try {
						await readFile(
							resolve(ROOT, 'scripts/wiki/backfill-error-fingerprints.mjs'),
							'utf8'
						);
						return { open: false, evidence: 'backfill-error-fingerprints.mjs exists' };
					} catch {
						return {
							open: true,
							evidence: 'scripts/wiki/backfill-error-fingerprints.mjs does not exist',
						};
					}
				}
			},
			summary:
				'schema-postgres.ts defines error_fingerprints table but no script populates it from tsgo diagnostics. ' +
				'Cold starts miss all error context.',
			why:
				'The hash lane in multiLaneSearch reads Redis first (ace:error:fp:*) with Postgres fallback. ' +
				'If Redis is cold and Postgres is empty, error context is always absent.',
			patch:
				'Create scripts/wiki/backfill-error-fingerprints.mjs: reads scratch/audits/tsgo-diagnostics.json → ' +
				'upserts into error_fingerprints → warms Redis ace:error:fp:* keys.',
			affectedFiles: [
				'src/lib/server/db/schema-postgres.ts',
				'src/lib/server/ace/error-fingerprint.ts',
				'scripts/tsgo-diagnostics-to-jsonb.mjs',
			],
			affectedSymbols: ['errorFingerprints', 'lookupErrorFingerprint', 'fingerprintError'],
			affectedRedisKeys: ['ace:error:fp:*'],
		},
	];

	const now = new Date().toISOString();
	const runId = Math.random().toString(36).slice(2, 14);

	const gaps = [];
	for (const def of gapDefs) {
		let checkResult = { open: true, evidence: 'check not run' };
		try {
			checkResult = await def.check();
		} catch (e) {
			checkResult = { open: true, evidence: `check threw: ${String(e)}` };
		}

		const gap = {
			id: def.id,
			title: def.title,
			severity: def.severity,
			status: checkResult.open ? 'open' : 'fixed',
			summary: checkResult.open
				? def.summary
				: `[FIXED] ${def.summary}`,
			why: def.why,
			patch: def.patch,
			affectedFiles: def.affectedFiles,
			affectedSymbols: def.affectedSymbols,
			affectedRedisKeys: def.affectedRedisKeys ?? [],
			affectedMcpTools: [],
			discoveredByRun: runId,
			createdAt: now,
			updatedAt: now,
			_evidence: checkResult.evidence,
		};
		gaps.push(gap);

		const icon = checkResult.open ? '🔴' : '✅';
		log(`${icon} [${def.severity}] ${def.id}: ${checkResult.evidence}`);
	}

	const open = gaps.filter((g) => g.status === 'open');
	const report = {
		runId,
		pipelineVersion: '1.0.0',
		generatedAt: now,
		gaps,
		summary: {
			total: gaps.length,
			high: open.filter((g) => g.severity === 'HIGH').length,
			med: open.filter((g) => g.severity === 'MED').length,
			low: open.filter((g) => g.severity === 'LOW').length,
			open: open.length,
		},
	};

	log(
		`\nGap summary: ${report.summary.open}/${report.summary.total} open` +
		` (${report.summary.high} HIGH, ${report.summary.med} MED, ${report.summary.low} LOW)`
	);

	if (DRY_RUN) {
		log('\n[DRY RUN] Would write to Redis/CouchDB/Neo4j — skipping all writes.');
		console.log(JSON.stringify(report.summary, null, 2));
		return report;
	}

	// Step 2: Write to Redis
	if (!SKIP_REDIS) {
		log('\nStep 2 — caching in Redis...');
		try {
			const Redis = (await import('ioredis')).default;
			const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
				lazyConnect: true,
				connectTimeout: 4_000,
				commandTimeout: 8_000,
			});
			await redis.connect();
			const pipe = redis.pipeline();

			const TTL = 3600;
			// Cache gap docs
			for (const gap of gaps) {
				if (gap.status === 'open') {
					pipe.setex(`wiki:gap:${gap.id}`, TTL, JSON.stringify(gap));
				}
			}
			// Cache file reverse index
			const fileIndex = new Map();
			const symbolIndex = new Map();
			for (const gap of gaps.filter((g) => g.status === 'open')) {
				for (const f of gap.affectedFiles) {
					const list = fileIndex.get(f) ?? [];
					list.push(gap.id);
					fileIndex.set(f, list);
				}
				for (const s of gap.affectedSymbols) {
					const list = symbolIndex.get(s) ?? [];
					list.push(gap.id);
					symbolIndex.set(s, list);
				}
			}
			for (const [fp, ids] of fileIndex) {
				pipe.setex(`wiki:file:${fp}`, TTL, JSON.stringify(ids));
			}
			for (const [sym, ids] of symbolIndex) {
				pipe.setex(`wiki:symbol:${sym}`, TTL, JSON.stringify(ids));
			}
			// Cache report summary (short TTL)
			pipe.setex('wiki:gap:report:latest', 600, JSON.stringify(report.summary));

			await pipe.exec();
			await redis.quit();
			log(
				`Redis: ${open.length} gaps + ${fileIndex.size} file entries + ${symbolIndex.size} symbol entries written`
			);
		} catch (e) {
			err(`Redis write failed: ${e}`);
		}
	}

	// Step 3: Write to CouchDB
	if (!SKIP_COUCHDB) {
		log('\nStep 3 — writing to CouchDB wiki db...');
		const couchUrl = process.env.COUCHDB_URL ?? 'http://localhost:5984';
		const couchAuth =
			'Basic ' +
			Buffer.from(
				`${process.env.COUCHDB_USER ?? 'admin'}:${process.env.COUCHDB_PASS ?? 'password'}`
			).toString('base64');
		const db = process.env.COUCHDB_WIKI_DB ?? 'wiki';

		async function couchUpsert(id, doc) {
			try {
				const getRes = await fetch(`${couchUrl}/${db}/${encodeURIComponent(id)}`, {
					headers: { Authorization: couchAuth },
				});
				const rev =
					getRes.status === 200 ? (await getRes.json())._rev : undefined;
				const body = rev ? { ...doc, _id: id, _rev: rev } : { ...doc, _id: id };
				const putRes = await fetch(`${couchUrl}/${db}/${encodeURIComponent(id)}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json', Authorization: couchAuth },
					body: JSON.stringify(body),
				});
				return putRes.ok;
			} catch {
				return false;
			}
		}

		// Ensure db exists
		await fetch(`${couchUrl}/${db}`, {
			method: 'PUT',
			headers: { Authorization: couchAuth },
		}).catch(() => {});

		let written = 0;
		for (const gap of gaps) {
			if (await couchUpsert(`gap:${gap.id}`, gap)) written++;
		}
		if (await couchUpsert(`run:gap-report:${runId}`, report)) written++;
		log(`CouchDB: ${written} documents written`);
	}

	// Step 4: Write to Neo4j
	if (!SKIP_NEO4J) {
		log('\nStep 4 — syncing to Neo4j...');
		try {
			const neo4j = await import('neo4j-driver');
			const driver = neo4j.default.driver(
				process.env.NEO4J_URL ?? 'bolt://localhost:7687',
				neo4j.default.auth.basic(
					process.env.NEO4J_USER ?? 'neo4j',
					process.env.NEO4J_PASSWORD ?? 'neo4j_password'
				)
			);
			const session = driver.session();
			let rels = 0;

			for (const gap of gaps) {
				await session.run(
					`MERGE (g:Gap { id: $id })
					 SET g.severity = $severity, g.status = $status, g.title = $title, g.updatedAt = $updatedAt`,
					{ id: gap.id, severity: gap.severity, status: gap.status, title: gap.title, updatedAt: gap.updatedAt }
				).catch(() => {});

				for (const filePath of gap.affectedFiles) {
					await session.run(
						`MERGE (f:File { path: $path })
						 WITH f
						 MATCH (g:Gap { id: $gapId })
						 MERGE (g)-[:AFFECTS]->(f)`,
						{ path: filePath, gapId: gap.id }
					).catch(() => {});
					rels++;
				}

				await session.run(
					`MERGE (r:Run { id: $runId })
					 WITH r
					 MATCH (g:Gap { id: $gapId })
					 MERGE (r)-[:DISCOVERED]->(g)`,
					{ runId, gapId: gap.id }
				).catch(() => {});
				rels++;
			}

			await session.close();
			await driver.close();
			log(`Neo4j: ${gaps.length} gap nodes + ${rels} relationships written`);
		} catch (e) {
			err(`Neo4j write failed (not fatal): ${e}`);
		}
	}

	// Step 5: Write artifact to logs/wiki/
	await mkdir(LOGS_DIR, { recursive: true });
	const outPath = resolve(LOGS_DIR, `gap-report-${runId}.json`);
	await writeFile(outPath, JSON.stringify(report, null, 2));
	log(`\nArtifact written: ${outPath}`);

	// Final summary
	const highOpen = open.filter((g) => g.severity === 'HIGH');
	if (highOpen.length > 0) {
		log('\n⚠️  HIGH priority open gaps:');
		for (const g of highOpen) {
			log(`   ${g.id}: ${g.title}`);
			log(`   Patch: ${g.patch.slice(0, 120)}...`);
		}
	} else {
		log('\n✅ No HIGH priority gaps open.');
	}

	return report;
}

analyzeWikiGaps().catch((e) => {
	console.error('[wiki:gaps] Fatal:', e);
	process.exit(1);
});

async function analyzeWikiGaps() {
	return analyzeGaps();
}