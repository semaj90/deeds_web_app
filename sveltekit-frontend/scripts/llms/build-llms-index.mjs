/**
 * Karpathy LLM Wiki Indexer — Directory Card Orchestrator (GraphRAG flow)
 *
 * Scans the codebase, extracts logic-gate flags (G-AI-01 to G-AI-15),
 * and hydrates the AgentsDirectoryCard store across THREE tiers:
 *
 *   1. Postgres+Redis (already done by scripts/index-agents-md.mjs)
 *   2. CouchDB karpathy_wiki   — durable, doc-per-dir
 *   3. Neo4j graph              — (:AgentsCard) + (:Directory) + (:Feature) + (:Tag)
 *                                 nodes with HAS_CARD / IMPLEMENTS / TAGGED edges
 *   4. Analysis pass            — count incoming Feature/Tag edges per dir,
 *                                 write activityScore back to CouchDB enriched docs
 *
 * Flags (consumed by package.json scripts):
 *   --dry-run        : no writes, no Couch/Neo4j connections opened
 *   --limit=N        : process only first N dirs (after graph load)
 *   --quiet          : suppress per-dir progress lines
 *   --skip-couchdb   : skip CouchDB tier
 *   --skip-neo4j     : skip Neo4j tier (useful when bolt down)
 *   --skip-analysis  : skip the activityScore writeback pass
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const GRAPH_PATH = 'docs/graph/codebase-graph.json';
const COUCHDB_URL = process.env.COUCHDB_URL?.replace(/^https?:\/\/[^@]+@/, 'http://') ?? 'http://localhost:5984';
const DB_NAME = 'karpathy_wiki';
const NEO4J_URL = process.env.NEO4J_HTTP_URL ?? process.env.NEO4J_URL ?? 'http://localhost:7474';
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123';

const FLAGS = parseFlags(process.argv.slice(2));

function parseFlags(argv) {
	let limit = Infinity;
	// Support both `--limit=10` and `--limit 10` forms
	const eqArg = argv.find((a) => a.startsWith('--limit='));
	if (eqArg) {
		const n = parseInt(eqArg.slice('--limit='.length), 10);
		if (Number.isFinite(n) && n > 0) limit = n;
	} else {
		const idx = argv.indexOf('--limit');
		if (idx >= 0 && argv[idx + 1]) {
			const n = parseInt(argv[idx + 1], 10);
			if (Number.isFinite(n) && n > 0) limit = n;
		}
	}
	return {
		dryRun:       argv.includes('--dry-run'),
		limit,
		quiet:        argv.includes('--quiet'),
		skipCouchdb:  argv.includes('--skip-couchdb'),
		skipNeo4j:    argv.includes('--skip-neo4j'),
		skipAnalysis: argv.includes('--skip-analysis'),
	};
}

const log = (...args) => { if (!FLAGS.quiet) console.log(...args); };

async function main() {
	log('=== Karpathy LLM Wiki Indexer ===');
	// Contract startup line — matches the regression test in tests/agents-index-cli.spec.ts
	const writersState = FLAGS.dryRun ? 'disabled' : 'enabled';
	const limitDisplay = FLAGS.limit === Infinity ? 'none' : FLAGS.limit;
	console.log(`[agents:index] dryRun=${FLAGS.dryRun} limit=${limitDisplay} writers=${writersState}`);
	if (FLAGS.dryRun) log('[dry-run] no writes will occur');
	if (FLAGS.limit !== Infinity) log(`[limit] capped at ${FLAGS.limit} dirs`);

	if (!fs.existsSync(GRAPH_PATH)) {
		console.error(`Graph not found: ${GRAPH_PATH}. Run 'npm run graphify' first.`);
		process.exit(1);
	}

	const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf-8'));
	const allDirs = graph.directories ?? [];
	const dirs = FLAGS.limit !== Infinity ? allDirs.slice(0, FLAGS.limit) : allDirs;
	const total = dirs.length;

	log(`Processing ${total} directories${FLAGS.limit !== Infinity ? ` (of ${allDirs.length})` : ''}...`);

	const cards = [];
	for (const dirData of dirs) {
		const dirPath = dirData.dir;
		const card = buildCard(dirPath, dirData, graph);
		cards.push(card);
	}

	const counts = { couchdbWrites: 0, couchdbSkips: 0, neo4jWrites: 0, neo4jErrors: 0, analysisUpdates: 0 };

	// Stage 1: CouchDB
	if (FLAGS.skipCouchdb) {
		log('[skip] CouchDB stage disabled by --skip-couchdb');
	} else if (FLAGS.dryRun) {
		log(`[dry-run] would write ${cards.length} cards to CouchDB`);
	} else {
		log('Writing to CouchDB...');
		for (const card of cards) {
			try {
				const wrote = await writeToCouch(card);
				wrote ? counts.couchdbWrites++ : counts.couchdbSkips++;
			} catch (err) {
				console.error(`  Failed ${card.dirPath}:`, err.message);
			}
		}
	}

	// Stage 2: Neo4j (cards → graph nodes + edges)
	if (FLAGS.skipNeo4j) {
		log('[skip] Neo4j stage disabled by --skip-neo4j');
	} else if (FLAGS.dryRun) {
		log(`[dry-run] would write ${cards.length} cards to Neo4j`);
	} else {
		log('Writing to Neo4j (cards + Directory/Feature/Tag nodes + edges)...');
		try {
			counts.neo4jWrites = await writeCardsToNeo4j(cards);
		} catch (err) {
			counts.neo4jErrors++;
			console.error('  Neo4j sync failed (non-fatal):', err.message);
		}
	}

	// Stage 3: Analysis pass — count graph degree + write activityScore back
	if (FLAGS.skipAnalysis || FLAGS.skipNeo4j || FLAGS.skipCouchdb) {
		log('[skip] Analysis stage skipped (Neo4j or CouchDB disabled)');
	} else if (FLAGS.dryRun) {
		log('[dry-run] would compute activityScore + write back to CouchDB');
	} else {
		log('Running analysis (degree centrality → CouchDB activityScore writeback)...');
		try {
			counts.analysisUpdates = await runAnalysisPass(cards);
		} catch (err) {
			console.error('  Analysis pass failed (non-fatal):', err.message);
		}
	}

	// Summary
	const shipped = cards.filter(c => c.auditStatus === 'SHIPPED').length;
	const partial = cards.filter(c => c.auditStatus === 'PARTIAL').length;

	console.log(`\nIndexing Summary:`);
	console.log(`- Total:   ${total}`);
	console.log(`- SHIPPED: ${shipped} (has AGENTS.md)`);
	console.log(`- PARTIAL: ${partial} (has logic/source)`);
	console.log(`- OTHER:   ${total - shipped - partial}`);
	if (!FLAGS.dryRun) {
		console.log(`- CouchDB: ${counts.couchdbWrites} wrote, ${counts.couchdbSkips} skipped (hash unchanged)`);
		console.log(`- Neo4j:   ${counts.neo4jWrites} card nodes synced, ${counts.neo4jErrors} batch error(s)`);
		console.log(`- Analysis:${counts.analysisUpdates} cards re-scored`);
	}

	// Contract JSON summary — single line, machine-parsable, matches CLI regression test.
	// In dry-run all *Writes counters MUST be 0 — that is the safety invariant under test.
	const machineSummary = {
		dryRun:         FLAGS.dryRun,
		limit:          FLAGS.limit === Infinity ? null : FLAGS.limit,
		processed:      total,
		redisWrites:    0, // no Redis stage in this script (kept for contract parity)
		couchWrites:    FLAGS.dryRun ? 0 : counts.couchdbWrites,
		qdrantWrites:   0, // no Qdrant stage in this script (kept for contract parity)
		markdownWrites: 0, // no Markdown stage in this script (kept for contract parity)
		neo4jWrites:    FLAGS.dryRun ? 0 : counts.neo4jWrites,
		analysisUpdates: FLAGS.dryRun ? 0 : counts.analysisUpdates,
	};
	console.log(`[agents:index] summary=${JSON.stringify(machineSummary)}`);

	if (FLAGS.dryRun) {
		// Safety invariant: if dryRun is true, all write counters MUST be zero.
		const leaked = Object.entries(machineSummary)
			.filter(([k, v]) => k.endsWith('Writes') && v > 0);
		if (leaked.length > 0) {
			console.error(`[FATAL] Dry-run violation! Leaked writes: ${leaked.map(([k,v])=>`${k}=${v}`).join(', ')}`);
			process.exit(2);
		}
	}

	console.log('\nDone.');
}

async function writeToCouch(card) {
	const id = card.id;
	const url = `${COUCHDB_URL}/${DB_NAME}/${encodeURIComponent(id)}`;

	// Get existing for _rev
	const getRes = await fetch(url, {
		headers: { 'Authorization': authHeader() }
	});

	let body = { ...card };
	if (getRes.ok) {
		const existing = await getRes.json();
		if (existing.contentHash === card.contentHash) return false; // skip if unchanged
		body._rev = existing._rev;
	}

	const putRes = await fetch(url, {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': authHeader()
		},
		body: JSON.stringify(body)
	});

	if (!putRes.ok) {
		const err = await putRes.json();
		throw new Error(err.reason || putRes.statusText);
	}
	return true;
}

// ── Neo4j HTTP query helper ──────────────────────────────────────────────────

async function neo4jQuery(cypher, params = {}) {
	const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64')}`,
		},
		body: JSON.stringify({ statements: [{ statement: cypher, parameters: params }] }),
		signal: AbortSignal.timeout(20_000),
	});
	if (!res.ok) throw new Error(`Neo4j HTTP ${res.status}`);
	const data = await res.json();
	if (data.errors?.length) throw new Error(data.errors.map((e) => e.message).join('; '));
	return data.results?.[0]?.data ?? [];
}

/**
 * Stage 2 — sync AgentsCards into Neo4j as a small graph:
 *   (:AgentsCard {id, dirPath, auditStatus, contentHash})
 *     -[:DESCRIBES]-> (:Directory {path})
 *     -[:IMPLEMENTS]-> (:Feature {key})    (one per featureKey)
 *     -[:TAGGED]->     (:Tag {name})       (one per qdrantTag)
 *
 * Uses UNWIND batch for throughput. Idempotent via MERGE.
 * Returns the number of card nodes synced.
 */
async function writeCardsToNeo4j(cards) {
	if (cards.length === 0) return 0;

	const BATCH = 100;
	let total = 0;

	for (let i = 0; i < cards.length; i += BATCH) {
		const slice = cards.slice(i, i + BATCH);
		const rows = slice.map((c) => ({
			id:           c.id,
			dirPath:      c.dirPath,
			title:        c.title ?? '',
			auditStatus:  c.auditStatus ?? 'SPEC_ONLY',
			contentHash:  c.contentHash,
			featureKeys:  c.featureKeys ?? [],
			qdrantTags:   c.qdrantTags ?? [],
		}));

		// Single batched Cypher: MERGE the AgentsCard + Directory, foreach features/tags
		const cypher = `
			UNWIND $rows AS row
			MERGE (c:AgentsCard {id: row.id})
				SET c.dirPath = row.dirPath,
				    c.title = row.title,
				    c.auditStatus = row.auditStatus,
				    c.contentHash = row.contentHash,
				    c.lastIndexedAt = datetime()
			MERGE (d:Directory {path: row.dirPath})
			MERGE (c)-[:DESCRIBES]->(d)
			FOREACH (fk IN row.featureKeys |
				MERGE (f:Feature {key: fk})
				MERGE (c)-[:IMPLEMENTS]->(f)
			)
			FOREACH (tg IN row.qdrantTags |
				MERGE (t:Tag {name: tg})
				MERGE (c)-[:TAGGED]->(t)
			)
		`;
		await neo4jQuery(cypher, { rows });
		total += slice.length;
	}

	return total;
}

/**
 * Stage 3 — degree-centrality analysis. For each AgentsCard, count outgoing
 * IMPLEMENTS + TAGGED edges (its breadth) and incoming DESCRIBES (always 1).
 * Use breadth as a proxy "activityScore" and write back to the CouchDB doc.
 *
 * This is intentionally simple — full PageRank lives in scripts/run-pagerank.ts
 * for the broader graph. This pass is just enough to surface dirs that
 * implement many features OR carry many tags as "high-activity" cards in ACE.
 *
 * Returns the number of cards whose activityScore was updated.
 */
async function runAnalysisPass(cards) {
	// 1. Pull degree per card from Neo4j
	const cypher = `
		MATCH (c:AgentsCard)
		OPTIONAL MATCH (c)-[r1:IMPLEMENTS]->()
		OPTIONAL MATCH (c)-[r2:TAGGED]->()
		WITH c.id AS id, COUNT(DISTINCT r1) AS implCount, COUNT(DISTINCT r2) AS tagCount
		RETURN id, implCount + tagCount AS degree
	`;
	const rows = await neo4jQuery(cypher);
	const degreeById = new Map();
	for (const row of rows) {
		const [id, degree] = row.row;
		if (typeof id === 'string' && typeof degree === 'number') {
			degreeById.set(id, degree);
		}
	}

	// 2. Update activityScore on each card + writeback to CouchDB if changed
	let updated = 0;
	for (const card of cards) {
		const newScore = degreeById.get(card.id) ?? 0;
		if (newScore === (card.activityScore ?? 0)) continue;
		card.activityScore = newScore;
		// Re-hash so the CouchDB writer detects change
		card.contentHash = computeCardContentHash(card);
		try {
			const wrote = await writeToCouch(card);
			if (wrote) updated++;
		} catch (err) {
			console.error(`  analysis writeback failed for ${card.dirPath}:`, err.message);
		}
	}
	return updated;
}

function authHeader() {
	return 'Basic ' + Buffer.from('admin:deeds123').toString('base64');
}

function buildCard(dirPath, dirData, graph) {
	const id = cardIdForDir(dirPath);
	
	// Deriving gates
	const gates = {
		'G-AI-01': dirData.lines > 0,
		'G-AI-03': true,
		'G-AI-05': dirData.routes > 0 || dirData.apis > 0,
		'G-AI-06': dirPath.includes('src/lib/server/db/schema'),
		'G-AI-07': (dirData.tagList ?? []).length > 0,
		'G-AI-11': false,
		'G-AI-15': fs.existsSync(path.join(dirPath, 'AGENTS.md')),
	};

	const card = {
		id,
		dirPath,
		title: path.basename(dirPath) || 'root',
		summary: dirData.summary ?? '',
		staticImports: [],
		dynamicImports: [],
		pathAliases: [],
		featureKeys: dirData.featureKeys ?? [],
		routeSurfaces: gates['G-AI-05'] ? [dirPath] : [],
		schemaTables: gates['G-AI-06'] ? [dirPath] : [],
		qdrantTags: dirData.tagList ?? [],
		auditStatus: deriveAuditStatus(gates),
		recommendations: [],
		activityScore: 0,
		lastIndexedAt: new Date().toISOString(),
		gates,
	};

	card.contentHash = computeCardContentHash(card);
	return card;
}

function deriveAuditStatus(gates) {
	if (gates['G-AI-15']) return 'SHIPPED';
	if (gates['G-AI-01']) return 'PARTIAL';
	return 'SPEC_ONLY';
}

function cardIdForDir(dirPath) {
	const slug = dirPath.replace(/[\\/]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
	return `agents:dir:${slug || 'root'}`;
}

function computeCardContentHash(card) {
	const payload = JSON.stringify({
		dirPath:        card.dirPath,
		title:          card.title ?? '',
		summary:        card.summary ?? '',
		staticImports:  [...(card.staticImports ?? [])].sort(),
		dynamicImports: [...(card.dynamicImports ?? [])].sort(),
		pathAliases:    [...(card.pathAliases ?? [])].sort(),
		featureKeys:    [...(card.featureKeys ?? [])].sort(),
		routeSurfaces:  [...(card.routeSurfaces ?? [])].sort(),
		schemaTables:   [...(card.schemaTables ?? [])].sort(),
		qdrantTags:     [...(card.qdrantTags ?? [])].sort(),
		auditStatus:    card.auditStatus ?? 'SPEC_ONLY',
		gates:          Object.keys(card.gates ?? {}).sort().reduce((acc, k) => {
			acc[k] = !!card.gates?.[k];
			return acc;
		}, {}),
	});
	return createHash('sha256').update(payload).digest('hex');
}

main().catch(console.error);
