#!/usr/bin/env node
/**
 * Mini-Active NVMe Cache Builder
 *
 * Compiles ONE minified JSON file from Neo4j + CouchDB so ACE/KAG hot lookups
 * skip both round-trips:
 *
 *   Inputs (read-only)
 *     - Neo4j: (:AgentsCard)-[:DESCRIBES]->(:Directory) + IMPLEMENTS/TAGGED edges
 *     - CouchDB karpathy_wiki: agents:dir:* docs (full card payloads)
 *     - CouchDB karpathy_wiki: kag:cluster:agents:* docs (SOM cluster summaries)
 *
 *   Output: mini_active_nvme_cache/agents-graph.min.json
 *     {
 *       version, generatedAt, grid: {rows, cols},
 *       byCluster:  Record<"R-C", ClusterEntry>,   // SOM cell → summary + members
 *       byDirPath:  Record<dirPath, "R-C">,        // dir path → its cluster cell
 *       byFeature:  Record<feature, "R-C"[]>,      // feature key → cells implementing it
 *       byTag:      Record<tag, "R-C"[]>,          // tag → cells using it
 *       cardCount, clusterCount, featureCount, tagCount, dirCount
 *     }
 *
 *   Why one file: ACE prompt assembly is hot path. Loading 1 minified JSON
 *   (~hundreds of KB) at boot beats N Redis MGETs + Neo4j Cypher round-trips.
 *   Updated by re-running this script (cheap; ~250ms full rebuild).
 *
 * Hard rules:
 *   - READ-ONLY on all 3 backends (Neo4j, CouchDB, Postgres untouched)
 *   - No LLM calls
 *   - Pure JS — no GPU, no TensorRT, no CUDA
 *   - Output is gitignored (regenerable)
 *
 * Flags:
 *   --dry-run       : compute, print summary, no file write
 *   --pretty        : write pretty-printed JSON (debug; default minified)
 *   --skip-neo4j    : skip Neo4j enrichment (CouchDB-only fallback)
 *   --quiet         : suppress per-stage progress
 */

import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

const COUCHDB_URL = (process.env.COUCHDB_URL ?? 'http://localhost:5984').replace(/^https?:\/\/[^@]+@/, 'http://');
const COUCHDB_USER = process.env.COUCHDB_USER ?? 'admin';
const COUCHDB_PASS = process.env.COUCHDB_PASSWORD ?? 'deeds123';
const NEO4J_URL = process.env.NEO4J_HTTP_URL ?? process.env.NEO4J_URL ?? 'http://localhost:7474';
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123';

const OUT_DIR = resolve(ROOT, 'mini_active_nvme_cache');
const OUT_FILE = resolve(OUT_DIR, 'agents-graph.min.json');
const CACHE_VERSION = '1.0.0';

const FLAGS = parseFlags(process.argv.slice(2));
const log = (...a) => { if (!FLAGS.quiet) console.log(...a); };

function parseFlags(argv) {
	return {
		dryRun:    argv.includes('--dry-run'),
		pretty:    argv.includes('--pretty'),
		skipNeo4j: argv.includes('--skip-neo4j'),
		quiet:     argv.includes('--quiet'),
	};
}

function couchAuthHeader() {
	return 'Basic ' + Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASS}`).toString('base64');
}

function neo4jAuthHeader() {
	return 'Basic ' + Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64');
}

// ── Stage 1: pull AGENTS cards from CouchDB ───────────────────────────────────

async function fetchCards() {
	const url = `${COUCHDB_URL}/karpathy_wiki/_all_docs?include_docs=true&startkey=%22agents:dir:%22&endkey=%22agents:dir:zzz%22`;
	const res = await fetch(url, { headers: { Authorization: couchAuthHeader() } });
	if (!res.ok) throw new Error(`CouchDB cards fetch HTTP ${res.status}`);
	const body = await res.json();
	return (body.rows ?? []).map((r) => r.doc).filter((d) => d && typeof d.dirPath === 'string');
}

// ── Stage 2: pull SOM cluster docs from CouchDB ───────────────────────────────

async function fetchClusters() {
	const url = `${COUCHDB_URL}/karpathy_wiki/_all_docs?include_docs=true&startkey=%22kag%3Acluster%3Aagents%3A%22&endkey=%22kag%3Acluster%3Aagents%3Azzz%22`;
	const res = await fetch(url, { headers: { Authorization: couchAuthHeader() } });
	if (!res.ok) {
		// CouchDB hasn't been seeded with cluster docs yet — fall back to NVMe scan
		log('  CouchDB cluster docs missing; falling back to NVMe agents-dag/ scan');
		return fetchClustersFromNvme();
	}
	const body = await res.json();
	const docs = (body.rows ?? []).map((r) => r.doc).filter((d) => d?.id?.startsWith('kag:cluster:agents:') && d.id !== 'kag:cluster:agents:_index');
	if (docs.length === 0) return fetchClustersFromNvme();
	return docs;
}

async function fetchClustersFromNvme() {
	const fs = await import('node:fs');
	const dir = resolve(ROOT, 'memory/agents-dag');
	if (!fs.existsSync(dir)) {
		log('  NVMe agents-dag/ also empty — run npm run agents:som first');
		return [];
	}
	const files = fs.readdirSync(dir).filter((f) => f.startsWith('cluster-') && f.endsWith('.json'));
	return files.map((f) => JSON.parse(fs.readFileSync(resolve(dir, f), 'utf-8')));
}

// ── Stage 3: pull Neo4j IMPLEMENTS/TAGGED edges (per-card breadth) ────────────

async function neo4jQuery(cypher, params = {}) {
	const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: neo4jAuthHeader() },
		body: JSON.stringify({ statements: [{ statement: cypher, parameters: params }] }),
		signal: AbortSignal.timeout(20_000),
	});
	if (!res.ok) throw new Error(`Neo4j HTTP ${res.status}`);
	const data = await res.json();
	if (data.errors?.length) throw new Error(data.errors.map((e) => e.message).join('; '));
	return data.results?.[0]?.data ?? [];
}

async function fetchNeo4jDirToFeaturesAndTags() {
	if (FLAGS.skipNeo4j) return { byDirToFeatures: new Map(), byDirToTags: new Map() };
	try {
		// MapReduce-style aggregation in one Cypher pass:
		// for each Directory, collect distinct Feature keys + Tag names from its AgentsCard
		const cypher = `
			MATCH (c:AgentsCard)-[:DESCRIBES]->(d:Directory)
			OPTIONAL MATCH (c)-[:IMPLEMENTS]->(f:Feature)
			OPTIONAL MATCH (c)-[:TAGGED]->(t:Tag)
			WITH d.path AS dirPath, COLLECT(DISTINCT f.key) AS features, COLLECT(DISTINCT t.name) AS tags
			RETURN dirPath, features, tags
		`;
		const rows = await neo4jQuery(cypher);
		const byDirToFeatures = new Map();
		const byDirToTags = new Map();
		for (const row of rows) {
			const [dirPath, features, tags] = row.row;
			if (typeof dirPath !== 'string') continue;
			byDirToFeatures.set(dirPath, (features ?? []).filter(Boolean));
			byDirToTags.set(dirPath, (tags ?? []).filter(Boolean));
		}
		return { byDirToFeatures, byDirToTags };
	} catch (err) {
		log('  Neo4j enrichment failed (non-fatal):', err.message);
		return { byDirToFeatures: new Map(), byDirToTags: new Map() };
	}
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

async function main() {
	const t0 = Date.now();
	// Contract banner — matches the regression test in tests/agents-cache-cli.spec.ts
	const writersState = FLAGS.dryRun ? 'disabled' : 'enabled';
	console.log(`[mini-active-cache] dryRun=${FLAGS.dryRun} pretty=${FLAGS.pretty} skipNeo4j=${FLAGS.skipNeo4j} writers=${writersState}`);

	log('Stage 1: fetching cards from CouchDB karpathy_wiki...');
	let cards = [];
	try {
		cards = await fetchCards();
	} catch (err) {
		log(`  CouchDB cards fetch failed (${err.message}) — continuing with empty card set`);
	}
	log(`  ${cards.length} cards`);

	log('Stage 2: fetching SOM cluster docs (CouchDB first, NVMe fallback)...');
	let clusters = [];
	try {
		clusters = await fetchClusters();
	} catch (err) {
		log(`  cluster fetch failed (${err.message})`);
	}
	log(`  ${clusters.length} clusters`);
	if (clusters.length === 0) {
		// Under dry-run we still want to emit the contract summary so the CLI
		// regression can verify writers stay disabled — fall through with empty
		// inputs. Under real run we exit nonzero so operators see the problem.
		if (FLAGS.dryRun) {
			const empty = {
				version:      CACHE_VERSION,
				generatedAt:  new Date().toISOString(),
				grid:         { rows: 0, cols: 0 },
				cardCount:    cards.length,
				clusterCount: 0,
				featureCount: 0,
				tagCount:     0,
				dirCount:     0,
			};
			const machineSummary = {
				dryRun:         true,
				pretty:         FLAGS.pretty,
				skipNeo4j:      FLAGS.skipNeo4j,
				cardCount:      empty.cardCount,
				clusterCount:   0,
				featureCount:   0,
				tagCount:       0,
				dirCount:       0,
				nvmeWrites:     0,
				bytesWritten:   0,
				elapsedMs:      Date.now() - t0,
			};
			console.log(`[mini-active-cache] summary=${JSON.stringify(machineSummary)}`);
			console.log('[dry-run] no clusters found — would have produced empty cache; no write performed');
			return;
		}
		console.error('No clusters found. Run npm run agents:som first.');
		process.exit(1);
	}

	log('Stage 3: Neo4j MapReduce — dir → features + tags...');
	const { byDirToFeatures, byDirToTags } = await fetchNeo4jDirToFeaturesAndTags();
	log(`  Neo4j returned ${byDirToFeatures.size} dir → feature mappings`);

	log('Stage 4: rolling up unified lookup tables...');

	// Build dirPath → cluster key from cluster member lists
	const byDirPath = {};
	for (const c of clusters) {
		const key = `${c.somRow}-${c.somCol}`;
		for (const dirPath of c.memberPaths ?? []) {
			byDirPath[dirPath] = key;
		}
	}

	// Build feature → cells, tag → cells (deduped)
	const byFeature = {};
	const byTag = {};
	for (const c of clusters) {
		const key = `${c.somRow}-${c.somCol}`;
		for (const f of c.topFeatures ?? []) {
			(byFeature[f] ??= []).push(key);
		}
		for (const t of c.topTags ?? []) {
			(byTag[t] ??= []).push(key);
		}
	}
	// Dedupe each list (preserve order of first occurrence)
	for (const k of Object.keys(byFeature)) byFeature[k] = [...new Set(byFeature[k])];
	for (const k of Object.keys(byTag)) byTag[k] = [...new Set(byTag[k])];

	// Enrich features/tags from Neo4j MapReduce (covers cards whose own card.featureKeys
	// is empty but whose Neo4j card has IMPLEMENTS edges)
	for (const [dirPath, features] of byDirToFeatures.entries()) {
		const cell = byDirPath[dirPath];
		if (!cell) continue;
		for (const f of features) {
			if (!byFeature[f]) byFeature[f] = [cell];
			else if (!byFeature[f].includes(cell)) byFeature[f].push(cell);
		}
	}
	for (const [dirPath, tags] of byDirToTags.entries()) {
		const cell = byDirPath[dirPath];
		if (!cell) continue;
		for (const t of tags) {
			if (!byTag[t]) byTag[t] = [cell];
			else if (!byTag[t].includes(cell)) byTag[t].push(cell);
		}
	}

	// Build the per-cluster lookup
	const byCluster = {};
	let inferredGrid = { rows: 0, cols: 0 };
	for (const c of clusters) {
		const key = `${c.somRow}-${c.somCol}`;
		inferredGrid.rows = Math.max(inferredGrid.rows, c.somRow + 1);
		inferredGrid.cols = Math.max(inferredGrid.cols, c.somCol + 1);
		byCluster[key] = {
			somRow:       c.somRow,
			somCol:       c.somCol,
			memberCount:  c.memberCount,
			memberPaths:  c.memberPaths ?? [],
			topTags:      c.topTags ?? [],
			topFeatures:  c.topFeatures ?? [],
			summary:      (c.summary ?? '').slice(0, 1500), // cap to keep file size sane
		};
	}

	const cache = {
		version:      CACHE_VERSION,
		generatedAt:  new Date().toISOString(),
		grid:         inferredGrid,
		cardCount:    cards.length,
		clusterCount: Object.keys(byCluster).length,
		featureCount: Object.keys(byFeature).length,
		tagCount:     Object.keys(byTag).length,
		dirCount:     Object.keys(byDirPath).length,
		byCluster,
		byDirPath,
		byFeature,
		byTag,
	};

	log('Stage 5: writing minified JSON to NVMe...');

	let bytesWritten = 0;
	if (FLAGS.dryRun) {
		log(`[dry-run] would write to ${OUT_FILE}`);
	} else {
		if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
		const json = FLAGS.pretty ? JSON.stringify(cache, null, 2) : JSON.stringify(cache);
		writeFileSync(OUT_FILE, json);
		bytesWritten = statSync(OUT_FILE).size;
	}

	const elapsedMs = Date.now() - t0;
	console.log(`\nMini-Active-Cache Summary:`);
	console.log(`- Cards:       ${cache.cardCount}`);
	console.log(`- Clusters:    ${cache.clusterCount} (${cache.grid.rows}×${cache.grid.cols} grid)`);
	console.log(`- Features:    ${cache.featureCount}`);
	console.log(`- Tags:        ${cache.tagCount}`);
	console.log(`- Dirs mapped: ${cache.dirCount}`);
	if (!FLAGS.dryRun) {
		console.log(`- Output:      ${OUT_FILE}`);
		console.log(`- Bytes:       ${bytesWritten} (${(bytesWritten / 1024).toFixed(1)} KB)`);
	}
	console.log(`- Elapsed:     ${elapsedMs}ms`);

	// Machine-parsable contract summary — matches CLI regression test.
	// nvmeWrites + bytesWritten MUST be 0 under dryRun (safety invariant).
	const machineSummary = {
		dryRun:         FLAGS.dryRun,
		pretty:         FLAGS.pretty,
		skipNeo4j:      FLAGS.skipNeo4j,
		cardCount:      cache.cardCount,
		clusterCount:   cache.clusterCount,
		featureCount:   cache.featureCount,
		tagCount:       cache.tagCount,
		dirCount:       cache.dirCount,
		nvmeWrites:     FLAGS.dryRun ? 0 : 1,
		bytesWritten:   FLAGS.dryRun ? 0 : bytesWritten,
		elapsedMs,
	};
	console.log(`[mini-active-cache] summary=${JSON.stringify(machineSummary)}`);

	console.log('\nDone.');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});