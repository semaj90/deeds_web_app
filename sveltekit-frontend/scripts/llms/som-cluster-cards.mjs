#!/usr/bin/env node
/**
 * AGENTS card SOM clustering → DAG ingestion → KAG/ACE Redis hits
 *
 * Pipeline (per user direction 2026-05-11):
 *   1. Pull all AgentsDirectoryCard docs from CouchDB karpathy_wiki
 *   2. Build a small tag-frequency BoW vector per card (top-K most-common tags)
 *   3. Train a small SOM grid on the BoW vectors (default 6×6 = 36 cells)
 *   4. Assign each card a (somRow, somCol) — its BMU
 *   5. For each SOM cell, aggregate member cards into a "DAG cluster summary":
 *        - Concatenated `summary` fields (capped)
 *        - Top tags / featureKeys across members
 *        - Member count + member dirPaths
 *      If --with-llm is set, run Gemma4 to compress the cluster's text into a
 *      single 200-word summary (otherwise the deterministic concat is used).
 *   6. Persist as a DAG (parent SOM cluster → child cards):
 *        - NVMe (local cache):  memory/agents-dag/cluster-{R}-{C}.json
 *        - Redis (hot ACE hit): kag:cluster:agents:{R}-{C}   (TTL 3600s)
 *   7. Print summary table for the operator
 *
 * Hard rules respected:
 *   - Read-only on Postgres + Neo4j (no writes to either)
 *   - CouchDB read only (uses existing karpathy_wiki docs)
 *   - Fire-and-forget Redis writes (errors logged, not thrown)
 *   - LLM step is OFF by default (`--with-llm` opts in; needs Ollama on :11434)
 *
 * Flags:
 *   --grid=RxC          SOM grid (default 6x6 = 36 cells for ~400 cards)
 *   --iters=N           SOM training iterations (default 200)
 *   --bow-dim=N         BoW vector dimensionality (default 64; top-N tags)
 *   --with-llm          Run Gemma4 for each cluster summary (slower; needs Ollama)
 *   --dry-run           Print plan, no writes (NVMe + Redis both skipped)
 *   --skip-redis        Skip Redis tier (still writes NVMe)
 *   --skip-nvme         Skip NVMe tier (still writes Redis)
 *   --quiet             Suppress per-cluster progress lines
 *
 * Output:
 *   memory/agents-dag/cluster-{R}-{C}.json
 *   memory/agents-dag/index.json   (cell list + counts; lookup root)
 *   redis: kag:cluster:agents:{R}-{C}
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from 'redis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

const COUCHDB_URL = (process.env.COUCHDB_URL ?? 'http://localhost:5984').replace(/^https?:\/\/[^@]+@/, 'http://');
const COUCHDB_USER = process.env.COUCHDB_USER ?? 'admin';
const COUCHDB_PASS = process.env.COUCHDB_PASSWORD ?? 'deeds123';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const LLM_MODEL = process.env.GEMMA4_MODEL ?? 'gemma4-rotorquant:latest';

const NVME_DIR = resolve(ROOT, 'memory/agents-dag');
const REDIS_TTL = 3600; // 1h hot cache

const FLAGS = parseFlags(process.argv.slice(2));

function parseFlags(argv) {
	const get = (name, fallback) => {
		const eq = argv.find((a) => a.startsWith(`--${name}=`));
		if (eq) return eq.slice(`--${name}=`.length);
		const idx = argv.indexOf(`--${name}`);
		if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) return argv[idx + 1];
		return fallback;
	};
	const gridRaw = get('grid', '6x6');
	const [gridRows, gridCols] = gridRaw.split('x').map((n) => Math.max(1, parseInt(n, 10) || 6));
	return {
		gridRows,
		gridCols,
		iters: parseInt(get('iters', '200'), 10) || 200,
		bowDim: parseInt(get('bow-dim', '64'), 10) || 64,
		withLlm: argv.includes('--with-llm'),
		dryRun: argv.includes('--dry-run'),
		skipRedis: argv.includes('--skip-redis'),
		skipNvme: argv.includes('--skip-nvme'),
		quiet: argv.includes('--quiet'),
	};
}

const log = (...args) => { if (!FLAGS.quiet) console.log(...args); };

function authHeader() {
	return 'Basic ' + Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASS}`).toString('base64');
}

// ── Stage 1: CouchDB → cards ──────────────────────────────────────────────────

async function fetchAllCards() {
	const url = `${COUCHDB_URL}/karpathy_wiki/_all_docs?include_docs=true&startkey=%22agents:dir:%22&endkey=%22agents:dir:zzz%22`;
	const res = await fetch(url, { headers: { Authorization: authHeader() } });
	if (!res.ok) throw new Error(`CouchDB allDocs HTTP ${res.status}`);
	const body = await res.json();
	return (body.rows ?? []).map((r) => r.doc).filter((d) => d && d.id?.startsWith('agents:dir:'));
}

// ── Stage 2: BoW vectorisation ────────────────────────────────────────────────

function buildVocabulary(cards, dim) {
	const freq = new Map();
	for (const c of cards) {
		for (const t of c.qdrantTags ?? []) freq.set(t, (freq.get(t) ?? 0) + 1);
		for (const f of c.featureKeys ?? []) freq.set(f, (freq.get(f) ?? 0) + 1);
	}
	return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, dim).map(([t]) => t);
}

function vectorise(card, vocab) {
	const v = new Float32Array(vocab.length);
	const tagSet = new Set([...(card.qdrantTags ?? []), ...(card.featureKeys ?? [])]);
	for (let i = 0; i < vocab.length; i++) if (tagSet.has(vocab[i])) v[i] = 1;
	return v;
}

// ── Stage 3: SOM training (pure JS, online) ───────────────────────────────────

function l2(a, b) {
	let s = 0;
	for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
	return Math.sqrt(s);
}

function trainSom(vectors, rows, cols, iters) {
	const dim = vectors[0].length;
	// Initialise grid with random vectors in [0, 1]
	const grid = Array.from({ length: rows * cols }, () => {
		const v = new Float32Array(dim);
		for (let i = 0; i < dim; i++) v[i] = Math.random();
		return v;
	});
	const idx = (r, c) => r * cols + c;
	const initialRadius = Math.max(rows, cols) / 2;
	const initialLr = 0.5;
	const N = vectors.length;

	for (let iter = 0; iter < iters; iter++) {
		const t = iter / iters;
		const lr = initialLr * (1 - t);
		const radius = Math.max(0.5, initialRadius * (1 - t));
		const v = vectors[iter % N];

		// Find BMU
		let bestI = 0, bestD = Infinity;
		for (let i = 0; i < grid.length; i++) {
			const d = l2(v, grid[i]);
			if (d < bestD) { bestD = d; bestI = i; }
		}
		const br = Math.floor(bestI / cols), bc = bestI % cols;

		// Update neighbourhood
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const dr = r - br, dc = c - bc;
				const dist = Math.sqrt(dr * dr + dc * dc);
				if (dist > radius) continue;
				const influence = Math.exp(-(dist * dist) / (2 * radius * radius));
				const node = grid[idx(r, c)];
				for (let i = 0; i < dim; i++) node[i] += lr * influence * (v[i] - node[i]);
			}
		}
	}
	return { grid, rows, cols };
}

function bmuFor(vec, som) {
	let best = 0, bestD = Infinity;
	for (let i = 0; i < som.grid.length; i++) {
		const d = l2(vec, som.grid[i]);
		if (d < bestD) { bestD = d; best = i; }
	}
	return { row: Math.floor(best / som.cols), col: best % som.cols };
}

// ── Stage 5: cluster aggregation + optional LLM summary ───────────────────────

async function llmSummarise(text) {
	const prompt = `Summarise the following codebase directory cluster in 100 words or less. Focus on: what these directories share (tags/features), what they collectively implement, and any architecture patterns.\n\n${text.slice(0, 4000)}\n\nSummary:`;
	const res = await fetch(`${OLLAMA_URL}/api/generate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: LLM_MODEL, prompt, stream: false, options: { temperature: 0.2, num_predict: 200 } }),
		signal: AbortSignal.timeout(60_000),
	});
	if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
	const data = await res.json();
	return String(data.response ?? '').trim();
}

function aggregateCluster(members) {
	const tagFreq = new Map();
	const featFreq = new Map();
	const summaries = [];
	for (const m of members) {
		for (const t of m.qdrantTags ?? []) tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1);
		for (const f of m.featureKeys ?? []) featFreq.set(f, (featFreq.get(f) ?? 0) + 1);
		if (m.summary) summaries.push(`- ${m.dirPath}: ${m.summary.slice(0, 200)}`);
	}
	const topTags = [...tagFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
	const topFeatures = [...featFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([f]) => f);
	return { topTags, topFeatures, summaries };
}

// ── Pipeline orchestrator ─────────────────────────────────────────────────────

async function main() {
	const t0 = Date.now();
	console.log(`[som-cluster-cards] grid=${FLAGS.gridRows}x${FLAGS.gridCols} iters=${FLAGS.iters} bow-dim=${FLAGS.bowDim} withLlm=${FLAGS.withLlm} dryRun=${FLAGS.dryRun}`);

	log('Stage 1: fetching AGENTS cards from CouchDB...');
	const cards = await fetchAllCards();
	log(`  loaded ${cards.length} cards`);
	if (cards.length < 4) {
		console.error('Too few cards to cluster. Run npm run agents:index first.');
		process.exit(1);
	}

	log('Stage 2: building BoW vocabulary + vectors...');
	const vocab = buildVocabulary(cards, FLAGS.bowDim);
	if (vocab.length === 0) {
		console.error('No tags/features in any card — cannot cluster.');
		process.exit(1);
	}
	const vectors = cards.map((c) => vectorise(c, vocab));
	log(`  vocab=${vocab.length} terms, ${vectors.length} vectors`);

	log(`Stage 3: training SOM ${FLAGS.gridRows}×${FLAGS.gridCols} for ${FLAGS.iters} iters...`);
	const som = trainSom(vectors, FLAGS.gridRows, FLAGS.gridCols, FLAGS.iters);
	log(`  SOM ready (${som.grid.length} cells)`);

	log('Stage 4: assigning BMU per card...');
	const cells = new Map(); // key "R-C" → { members: [card], row, col }
	for (let i = 0; i < cards.length; i++) {
		const { row, col } = bmuFor(vectors[i], som);
		const key = `${row}-${col}`;
		if (!cells.has(key)) cells.set(key, { row, col, members: [] });
		cells.get(key).members.push(cards[i]);
	}
	log(`  populated ${cells.size} cells (of ${som.grid.length} possible)`);

	log('Stage 5: aggregating clusters' + (FLAGS.withLlm ? ' (with Gemma4 summaries)...' : ' (deterministic concat)...'));
	const dagNodes = [];
	let llmFails = 0;
	let i = 0;
	for (const [key, cell] of cells) {
		i++;
		if (!FLAGS.quiet) console.log(`  [${i}/${cells.size}] Summarising cluster ${key}...`);
		const agg = aggregateCluster(cell.members);
		let summary = `Cluster ${key} (${cell.members.length} dirs). Top tags: ${agg.topTags.join(', ') || '∅'}. Top features: ${agg.topFeatures.join(', ') || '∅'}.\nMembers:\n${agg.summaries.join('\n').slice(0, 2000)}`;
		if (FLAGS.withLlm) {
			try {
				summary = await llmSummarise(summary);
			} catch (err) {
				llmFails++;
				if (!FLAGS.quiet) console.warn(`  cluster ${key} LLM failed: ${err.message}`);
			}
		}
		dagNodes.push({
			id: `kag:cluster:agents:${key}`,
			somRow: cell.row,
			somCol: cell.col,
			memberCount: cell.members.length,
			memberIds: cell.members.map((m) => m.id),
			memberPaths: cell.members.map((m) => m.dirPath),
			topTags: agg.topTags,
			topFeatures: agg.topFeatures,
			summary,
			generatedAt: new Date().toISOString(),
		});
	}

	log('Stage 6: persisting DAG...');
	let nvmeWrites = 0, redisWrites = 0;

	if (FLAGS.dryRun) {
		log(`[dry-run] would write ${dagNodes.length} cluster docs to NVMe + Redis`);
	} else {
		// NVMe
		if (!FLAGS.skipNvme) {
			if (!existsSync(NVME_DIR)) mkdirSync(NVME_DIR, { recursive: true });
			for (const node of dagNodes) {
				try {
					writeFileSync(resolve(NVME_DIR, `cluster-${node.somRow}-${node.somCol}.json`), JSON.stringify(node, null, 2));
					nvmeWrites++;
				} catch (err) {
					if (!FLAGS.quiet) console.warn(`  nvme write failed for ${node.id}: ${err.message}`);
				}
			}
			// Index file (lookup root)
			const index = {
				generatedAt: new Date().toISOString(),
				grid: { rows: FLAGS.gridRows, cols: FLAGS.gridCols },
				totalCards: cards.length,
				populatedCells: dagNodes.length,
				cells: dagNodes.map((n) => ({ key: `${n.somRow}-${n.somCol}`, count: n.memberCount, topTags: n.topTags.slice(0, 4) })),
			};
			writeFileSync(resolve(NVME_DIR, 'index.json'), JSON.stringify(index, null, 2));
		}

		// Redis
		if (!FLAGS.skipRedis) {
			const redis = createClient({ url: REDIS_URL });
			redis.on('error', () => {}); // squelch
			try {
				await redis.connect();
				for (const node of dagNodes) {
					try {
						await redis.setEx(node.id, REDIS_TTL, JSON.stringify(node));
						redisWrites++;
					} catch (err) {
						if (!FLAGS.quiet) console.warn(`  redis write failed for ${node.id}: ${err.message}`);
					}
				}
				// Cluster index key for ACE consumer to enumerate without SCAN
				await redis.setEx('kag:cluster:agents:_index', REDIS_TTL, JSON.stringify({
					grid: { rows: FLAGS.gridRows, cols: FLAGS.gridCols },
					cells: dagNodes.map((n) => ({ key: `${n.somRow}-${n.somCol}`, count: n.memberCount })),
					generatedAt: new Date().toISOString(),
				}));
			} catch (err) {
				console.warn('Redis tier failed (non-fatal):', err.message);
			} finally {
				await redis.quit().catch(() => {});
			}
		}
	}

	const elapsedMs = Date.now() - t0;
	console.log(`\nDAG Ingestion Summary:`);
	console.log(`- Cards loaded:    ${cards.length}`);
	console.log(`- BoW vocab:       ${vocab.length}`);
	console.log(`- SOM cells:       ${som.grid.length} (${dagNodes.length} populated)`);
	console.log(`- Cluster sizes:   min=${Math.min(...dagNodes.map((n) => n.memberCount))} max=${Math.max(...dagNodes.map((n) => n.memberCount))} avg=${(cards.length / dagNodes.length).toFixed(1)}`);
	if (FLAGS.withLlm) console.log(`- LLM summaries:   ${dagNodes.length - llmFails} ok, ${llmFails} failed`);
	if (!FLAGS.dryRun) {
		console.log(`- NVMe writes:     ${nvmeWrites} → ${NVME_DIR}`);
		console.log(`- Redis writes:    ${redisWrites} keys (TTL ${REDIS_TTL}s)`);
	}
	console.log(`- Elapsed:         ${elapsedMs}ms`);
	console.log('\nDone.');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
