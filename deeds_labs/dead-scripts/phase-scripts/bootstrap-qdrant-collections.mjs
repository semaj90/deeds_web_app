#!/usr/bin/env node
/**
 * Bootstrap missing Qdrant collections.
 * Creates collections referenced in route code that don't exist yet.
 * Safe to run repeatedly — skips collections that already exist.
 *
 * Usage:
 *   node scripts/bootstrap-qdrant-collections.mjs
 *   QDRANT_URL=http://qdrant:6333 node scripts/bootstrap-qdrant-collections.mjs
 */

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';

// Collections referenced in route code with their vector configs
// 768-dim = embeddinggemma:latest output dimension
const COLLECTIONS = [
	{ name: 'embeddings', size: 768, distance: 'Cosine' },
	{ name: 'phase79_codebase', size: 768, distance: 'Cosine' },
	{ name: 'phase79_error_analysis', size: 768, distance: 'Cosine' },
	{ name: 'phase89_ast_embeddings', size: 768, distance: 'Cosine' },
	{ name: 'phase89_rag_patterns', size: 768, distance: 'Cosine' },
	{ name: 'ace_web_crawl', size: 768, distance: 'Cosine' },
	// edit_log is event-based but giving it vectors keeps the API uniform
	{ name: 'phase89_edit_log', size: 768, distance: 'Cosine' },
];

async function main() {
	console.log(`Qdrant URL: ${QDRANT_URL}`);

	// Check connectivity
	try {
		const health = await fetch(QDRANT_URL);
		if (!health.ok) throw new Error(`HTTP ${health.status}`);
		const info = await health.json();
		console.log(`Qdrant ${info.version ?? 'unknown'} is healthy\n`);
	} catch (e) {
		console.error(`Cannot reach Qdrant at ${QDRANT_URL}:`, e.message);
		process.exit(1);
	}

	let created = 0, skipped = 0, failed = 0;

	for (const col of COLLECTIONS) {
		// Check if exists
		const check = await fetch(`${QDRANT_URL}/collections/${col.name}`);

		if (check.ok) {
			const data = await check.json();
			const points = data.result?.points_count ?? 0;
			console.log(`  EXISTS  ${col.name} (${points} points)`);
			skipped++;
			continue;
		}

		// Create it
		try {
			const res = await fetch(`${QDRANT_URL}/collections/${col.name}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					vectors: { size: col.size, distance: col.distance }
				})
			});

			if (res.ok) {
				console.log(`  CREATED ${col.name} (${col.size}-dim ${col.distance})`);
				created++;
			} else {
				const err = await res.text();
				console.error(`  FAILED  ${col.name}: ${err}`);
				failed++;
			}
		} catch (e) {
			console.error(`  FAILED  ${col.name}: ${e.message}`);
			failed++;
		}
	}

	console.log(`\nDone: ${created} created, ${skipped} already existed, ${failed} failed`);
}

main();