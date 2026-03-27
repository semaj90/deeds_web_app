/**
 * Retrieval Eval Harness — Measures precision, recall, and MRR for hybrid search.
 *
 * Runs labeled query sets against legal_canon_chunks and fictional_case_chunks
 * Qdrant collections. Compares sparse-only, dense-only, and hybrid (RRF) modes.
 *
 * Usage: node scripts/eval-retrieval-harness.mjs [--verbose]
 */

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const VOCAB_SIZE = 2_000_000;
const verbose = process.argv.includes('--verbose');

// ── FNV-1a hash (matches bm42-sparse.ts) ──
function fnv1a(token) {
	let h = 0x811c9dc5;
	for (let i = 0; i < token.length; i++) {
		h ^= token.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0) % VOCAB_SIZE;
}

const STOP_WORDS = new Set([
	'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
	'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
	'should', 'may', 'might', 'can', 'could', 'must', 'to', 'of', 'in',
	'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
	'during', 'before', 'after', 'above', 'below', 'between', 'under',
	'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
	'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
	'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same', 'so',
	'than', 'too', 'very', 'and', 'but', 'or', 'nor', 'if', 'that',
	'which', 'who', 'whom', 'this', 'these', 'those', 'it', 'its',
]);

function generateSparseVector(text) {
	const tokens = text
		.toLowerCase()
		.replace(/[^\w\s§./-]/g, ' ')
		.split(/\s+/)
		.filter((t) => t.length > 1 && !STOP_WORDS.has(t));

	const tf = new Map();
	for (const token of tokens) {
		const idx = fnv1a(token);
		const isLegal =
			token.startsWith('§') || token.includes('u.s.c') || token.includes('cfr') ||
			token.includes('usc') || token.includes('fre') || token.includes('frcp');
		const entry = tf.get(idx) || { count: 0, isLegal: false };
		entry.count++;
		if (isLegal) entry.isLegal = true;
		tf.set(idx, entry);
	}

	const indices = [];
	const values = [];
	for (const [idx, { count, isLegal }] of tf) {
		indices.push(idx);
		values.push(Math.log(1 + count) * (isLegal ? 2.0 : 1.0));
	}

	const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
	if (norm > 0) {
		for (let i = 0; i < values.length; i++) values[i] /= norm;
	}
	return { indices, values };
}

async function qdrantFetch(path, opts = {}) {
	const res = await fetch(`${QDRANT_URL}${path}`, {
		headers: { 'Content-Type': 'application/json' },
		...opts,
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Qdrant ${res.status}: ${text}`);
	}
	return res.json();
}

async function embed(text) {
	const res = await fetch(`${OLLAMA_URL}/api/embed`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: 'embeddinggemma:latest', input: [text] }),
	});
	if (!res.ok) throw new Error(`Ollama embed ${res.status}: ${await res.text()}`);
	const data = await res.json();
	return data.embeddings[0];
}

// ── Search modes ──
async function searchSparseOnly(collection, query, limit) {
	const sparse = generateSparseVector(query);
	const res = await qdrantFetch(`/collections/${collection}/points/query`, {
		method: 'POST',
		body: JSON.stringify({
			prefetch: [{ query: sparse, using: 'bm25', limit }],
			query: { fusion: 'rrf' },
			limit,
			with_payload: true,
		}),
	});
	return res.result?.points ?? [];
}

async function searchDenseOnly(collection, query, limit) {
	const denseVec = await embed(query);
	const res = await qdrantFetch(`/collections/${collection}/points/query`, {
		method: 'POST',
		body: JSON.stringify({
			prefetch: [{ query: denseVec, using: 'content', limit }],
			query: { fusion: 'rrf' },
			limit,
			with_payload: true,
		}),
	});
	return res.result?.points ?? [];
}

async function searchHybrid(collection, query, limit) {
	const [denseVec, sparse] = await Promise.all([
		embed(query),
		Promise.resolve(generateSparseVector(query)),
	]);
	const res = await qdrantFetch(`/collections/${collection}/points/query`, {
		method: 'POST',
		body: JSON.stringify({
			prefetch: [
				{ query: denseVec, using: 'content', limit: limit * 2 },
				{ query: sparse, using: 'bm25', limit: limit * 2 },
			],
			query: { fusion: 'rrf' },
			limit,
			with_payload: true,
		}),
	});
	return res.result?.points ?? [];
}

// ── Metrics ──
function precisionAtK(results, expected, k) {
	const topK = results.slice(0, k);
	const hits = topK.filter((r) => expected.has(getResultId(r)));
	return hits.length / k;
}

function recallAtK(results, expected, k) {
	if (expected.size === 0) return 1.0;
	const topK = results.slice(0, k);
	const hits = topK.filter((r) => expected.has(getResultId(r)));
	return hits.length / expected.size;
}

function mrr(results, expected) {
	for (let i = 0; i < results.length; i++) {
		if (expected.has(getResultId(results[i]))) {
			return 1.0 / (i + 1);
		}
	}
	return 0;
}

function getResultId(r) {
	// Canon collection uses chunk_id payload, fictional uses category
	return r.payload?.chunk_id || r.payload?.case_uuid || String(r.id);
}

// ── Labeled Query Sets ──
const CANON_QUERIES = [
	{
		query: 'hearsay evidence exceptions testimony',
		expectedChunkIds: [
			'632fbf19:0:1715a5cd06d80f54', // FRE 801
			'632fbf19:1:d278e7579b82d2dd', // FRE 801
			'0ef90cda:0:01c3fbf66b806515', // FRE 802
			'7b5bf66b:0:c72be1bcd3aaa6e4', // FRE 803
			'7b5bf66b:1:b2c328269df5b482', // FRE 803
		],
		label: 'Hearsay rules',
	},
	{
		query: 'wire fraud federal elements scheme to defraud',
		expectedChunkIds: ['1a972c6a:0:e84cc0eceeabdc92'], // 18 USC §1343
		label: 'Wire fraud statute',
	},
	{
		query: 'computer fraud unauthorized access protected computer CFAA',
		expectedChunkIds: [
			'eb47a32e:0:64cfba14790445dd', // 18 U.S.C. § 1030
			'eb47a32e:1:a260fe05e7861f78',
		],
		label: 'CFAA statute',
	},
	{
		query: 'firearms possession by felon prohibited person',
		expectedChunkIds: [
			'0dc8f56e:0:bd4fcc64368619b1', // 18 U.S.C. § 922
			'0dc8f56e:1:ad005bd6c88b5ee8',
		],
		label: 'Firearms statute',
	},
	{
		query: 'Miranda rights custodial interrogation self incrimination',
		expectedChunkIds: ['322b2e58:0:c86b0212e9559b92'], // 384 U.S. 436
		label: 'Miranda v. Arizona',
	},
	{
		query: 'right to counsel Sixth Amendment appointed attorney',
		expectedChunkIds: ['7e640377:0:888fa4cf1468c318'], // 372 U.S. 335
		label: 'Gideon v. Wainwright',
	},
	{
		query: 'exclusionary rule Fourth Amendment illegal search',
		expectedChunkIds: ['ea3c4f9d:0:2704f4095355cf4f'], // 367 U.S. 643
		label: 'Mapp v. Ohio',
	},
	{
		query: 'stop and frisk reasonable suspicion Terry',
		expectedChunkIds: ['e687d865:0:109d3e6492a689b7'], // 392 U.S. 1
		label: 'Terry v. Ohio',
	},
	{
		query: 'obstruction of justice witness tampering destruction of evidence',
		expectedChunkIds: [
			'f6b010bf:0:8342c71ec3cf219d', // 18 USC §1512
			'27739670:0:8382ff3bd1d5bf02', // 18 USC §1519
		],
		label: 'Obstruction statutes',
	},
	{
		query: 'evidence relevance admissibility probative value',
		expectedChunkIds: [
			'b2b1b3d9:0:d6f799548c15bcf6', // FRE 401
			'62e8cce3:0:8b8089c936bd5ee6', // FRE 402
			'2f77bd5e:0:e55a3627ea69a6b6', // FRE 403
		],
		label: 'Relevance rules',
	},
	{
		query: 'search and seizure warrant expectation of privacy',
		expectedChunkIds: ['41468610:0:580cfbc58b7079ce'], // 389 U.S. 347 (Katz)
		label: 'Katz v. United States',
	},
	{
		query: 'mail fraud devised scheme federal',
		expectedChunkIds: ['db8ffcca:0:a5efe736972ee1af'], // 18 USC §1341
		label: 'Mail fraud statute',
	},
];

const FICTIONAL_QUERIES = [
	{
		query: 'wire fraud bank scheme financial loss',
		expectedCategories: ['wire_fraud'],
		label: 'Wire fraud cases',
	},
	{
		query: 'drug trafficking investigation controlled substance',
		expectedCategories: ['drug_trafficking'],
		label: 'Drug trafficking cases',
	},
	{
		query: 'cybercrime network intrusion hacking unauthorized access',
		expectedCategories: ['cybercrime'],
		label: 'Cybercrime cases',
	},
	{
		query: 'firearms illegal possession prohibited person',
		expectedCategories: ['firearms'],
		label: 'Firearms cases',
	},
	{
		query: 'breach of contract verbal agreement oral promise',
		expectedCategories: ['verbal_contracts'],
		label: 'Verbal contract cases',
	},
	{
		query: 'federal tort claim negligence government liability',
		expectedCategories: ['tort_federal', 'federal_employee_liability'],
		label: 'Federal tort cases',
	},
	{
		query: 'obstruction tampering witness destruction records',
		expectedCategories: ['obstruction'],
		label: 'Obstruction cases',
	},
];

async function evalCanonQueries() {
	console.log('\n═══════════════════════════════════════════════════════════════');
	console.log('  LEGAL CANON CHUNKS — Retrieval Evaluation');
	console.log('═══════════════════════════════════════════════════════════════\n');

	const K = 5;
	const results = { sparse: [], dense: [], hybrid: [] };

	for (const q of CANON_QUERIES) {
		const expected = new Set(q.expectedChunkIds);

		if (verbose) console.log(`\n  Query: "${q.query}" (${q.label})`);
		if (verbose) console.log(`  Expected: ${q.expectedChunkIds.length} chunks`);

		// Run all 3 modes
		const [sparseHits, denseHits, hybridHits] = await Promise.all([
			searchSparseOnly('legal_canon_chunks', q.query, K),
			searchDenseOnly('legal_canon_chunks', q.query, K),
			searchHybrid('legal_canon_chunks', q.query, K),
		]);

		for (const [mode, hits] of [['sparse', sparseHits], ['dense', denseHits], ['hybrid', hybridHits]]) {
			const p = precisionAtK(hits, expected, K);
			const r = recallAtK(hits, expected, K);
			const m = mrr(hits, expected);
			results[mode].push({ label: q.label, precision: p, recall: r, mrr: m });

			if (verbose) {
				console.log(`    ${mode.padEnd(8)}: P@${K}=${p.toFixed(3)} R@${K}=${r.toFixed(3)} MRR=${m.toFixed(3)}`);
				for (const h of hits.slice(0, 3)) {
					const id = h.payload?.chunk_id || h.id;
					const match = expected.has(id) ? '+' : ' ';
					console.log(`      [${match}] ${String(h.score?.toFixed(3) || 'N/A').padEnd(6)} ${id}`);
				}
			}
	}

		process.stdout.write('.');
	}

	return results;
}

async function evalFictionalQueries() {
	console.log('\n\n═══════════════════════════════════════════════════════════════');
	console.log('  FICTIONAL CASE CHUNKS — Retrieval Evaluation');
	console.log('═══════════════════════════════════════════════════════════════\n');

	const K = 5;
	const results = { sparse: [], dense: [], hybrid: [] };

	for (const q of FICTIONAL_QUERIES) {
		const expectedCats = new Set(q.expectedCategories);

		if (verbose) console.log(`\n  Query: "${q.query}" (${q.label})`);

		const [sparseHits, denseHits, hybridHits] = await Promise.all([
			searchSparseOnly('fictional_case_chunks', q.query, K),
			searchDenseOnly('fictional_case_chunks', q.query, K),
			searchHybrid('fictional_case_chunks', q.query, K),
		]);

		for (const [mode, hits] of [['sparse', sparseHits], ['dense', denseHits], ['hybrid', hybridHits]]) {
			// For fictional: a hit is "correct" if its category matches expected
			const relevant = hits.filter((h) => expectedCats.has(h.payload?.category));
			const p = relevant.length / K;
			const r = relevant.length > 0 ? 1.0 : 0;
			const m = (() => {
				for (let i = 0; i < hits.length; i++) {
					if (expectedCats.has(hits[i].payload?.category)) return 1.0 / (i + 1);
				}
				return 0;
			})();
			results[mode].push({ label: q.label, precision: p, recall: r, mrr: m });

			if (verbose) {
				console.log(`    ${mode.padEnd(8)}: P@${K}=${p.toFixed(3)} R@${K}=${r.toFixed(3)} MRR=${m.toFixed(3)}`);
				for (const h of hits.slice(0, 3)) {
					const cat = h.payload?.category || '?';
					const match = expectedCats.has(cat) ? '+' : ' ';
					console.log(`      [${match}] ${String(h.score?.toFixed(3) || 'N/A').padEnd(6)} ${cat} — ${h.payload?.charge?.slice(0, 40)}`);
				}
			}
		}

		process.stdout.write('.');
	}

	return results;
}

function printSummary(label, results) {
	console.log(`\n\n  ${label}`);
	console.log('  ┌──────────┬──────────┬──────────┬──────────┐');
	console.log('  │ Mode     │ Avg P@5  │ Avg R@5  │ Avg MRR  │');
	console.log('  ├──────────┼──────────┼──────────┼──────────┤');

	for (const mode of ['sparse', 'dense', 'hybrid']) {
		const data = results[mode];
		const avgP = data.reduce((s, d) => s + d.precision, 0) / data.length;
		const avgR = data.reduce((s, d) => s + d.recall, 0) / data.length;
		const avgM = data.reduce((s, d) => s + d.mrr, 0) / data.length;
		const highlight = mode === 'hybrid' ? ' *' : '  ';
		console.log(`  │ ${mode.padEnd(8)} │ ${avgP.toFixed(4).padStart(8)} │ ${avgR.toFixed(4).padStart(8)} │ ${avgM.toFixed(4).padStart(8)} │${highlight}`);
	}

	console.log('  └──────────┴──────────┴──────────┴──────────┘');

	// Per-query breakdown for hybrid
	console.log('\n  Hybrid per-query breakdown:');
	for (const d of results.hybrid) {
		const bar = '█'.repeat(Math.round(d.mrr * 10));
		console.log(`    ${d.label.padEnd(26)} P=${d.precision.toFixed(2)} R=${d.recall.toFixed(2)} MRR=${d.mrr.toFixed(2)} ${bar}`);
	}
}

async function main() {
	console.log('\n╔═══════════════════════════════════════════════╗');
	console.log('║   Retrieval Eval Harness — Hybrid Search      ║');
	console.log('║   Collections: legal_canon_chunks              ║');
	console.log('║                fictional_case_chunks            ║');
	console.log('║   Modes: sparse (BM42) | dense (768d) | hybrid ║');
	console.log('╚═══════════════════════════════════════════════╝');

	// Verify collections exist
	for (const col of ['legal_canon_chunks', 'fictional_case_chunks']) {
		try {
			const info = await qdrantFetch(`/collections/${col}`);
			console.log(`\n  ${col}: ${info.result?.points_count} points`);
		} catch (err) {
			console.error(`  ${col}: NOT FOUND — ${err.message}`);
			process.exit(1);
		}
	}

	const t0 = Date.now();

	const canonResults = await evalCanonQueries();
	const fictionalResults = await evalFictionalQueries();

	const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

	console.log('\n\n═══════════════════════════════════════════════════════════════');
	console.log('  RESULTS SUMMARY');
	console.log('═══════════════════════════════════════════════════════════════');

	printSummary('Canon Chunks (12 labeled queries)', canonResults);
	printSummary('Fictional Cases (7 labeled queries)', fictionalResults);

	// Compute winner
	const canonHybridMRR = canonResults.hybrid.reduce((s, d) => s + d.mrr, 0) / canonResults.hybrid.length;
	const canonSparseMRR = canonResults.sparse.reduce((s, d) => s + d.mrr, 0) / canonResults.sparse.length;
	const canonDenseMRR = canonResults.dense.reduce((s, d) => s + d.mrr, 0) / canonResults.dense.length;

	console.log('\n  Canon Winner:', canonHybridMRR >= canonSparseMRR && canonHybridMRR >= canonDenseMRR
		? 'HYBRID (RRF fusion)' : canonDenseMRR > canonSparseMRR ? 'DENSE' : 'SPARSE');

	const ficHybridMRR = fictionalResults.hybrid.reduce((s, d) => s + d.mrr, 0) / fictionalResults.hybrid.length;
	const ficSparseMRR = fictionalResults.sparse.reduce((s, d) => s + d.mrr, 0) / fictionalResults.sparse.length;
	const ficDenseMRR = fictionalResults.dense.reduce((s, d) => s + d.mrr, 0) / fictionalResults.dense.length;

	console.log('  Fictional Winner:', ficHybridMRR >= ficSparseMRR && ficHybridMRR >= ficDenseMRR
		? 'HYBRID (RRF fusion)' : ficDenseMRR > ficSparseMRR ? 'DENSE' : 'SPARSE');

	console.log(`\n  Total eval time: ${elapsed}s`);
	console.log('  Queries: 12 canon + 7 fictional = 19 total');
	console.log('  Search calls: 19 × 3 modes = 57 total\n');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
