#!/usr/bin/env tsx
/**
 * N8 — Local sparse search CLI over notecard JSONL.
 *
 * Imports the canonical search logic from `src/lib/server/kb/search-logic.ts`
 * so the same scoring formula serves the CLI, MCP retrieval server, and any
 * future admin UI. Local-only: no Qdrant, no GPU, no LLM, no network.
 *
 * Usage:
 *   tsx scripts/kb/search-graph-cards.ts --query "auth redis" --limit 10
 *   $env:KB_GRAPH_SEARCH_QUERY="evidence pipeline"; npm run kb:search
 */

import { writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchNotecards } from '../../src/lib/server/kb/search-logic.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'memory', 'kb', 'notecards');

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	let query     = process.env.KB_GRAPH_SEARCH_QUERY ?? '';
	let limit     = 10;
	let cardsPath = process.env.KB_GRAPH_CARDS_PATH ?? join(OUT_DIR, 'graph_file_cards.jsonl');

	for (let i = 0; i < args.length; i += 1) {
		if (args[i] === '--query' || args[i] === '-q') query = args[++i] ?? '';
		else if (args[i] === '--limit' || args[i] === '-n') limit = parseInt(args[++i] ?? '10', 10);
		else if (args[i] === '--cards') cardsPath = args[++i] ?? cardsPath;
	}

	if (!query) {
		console.log('Usage: tsx scripts/kb/search-graph-cards.ts --query "string" [--limit 10]');
		console.log('       $env:KB_GRAPH_SEARCH_QUERY="..."; npm run kb:search');
		process.exit(0);
	}

	console.log(`[kb-search] Searching for "${query}" (limit ${limit})…`);

	try {
		const results = await searchNotecards({ query, limit, cardsPath });

		if (results.length === 0) {
			console.log('[kb-search] No matches found.');
		} else {
			console.log(`[kb-search] Found ${results.length} matches. Top results:\n`);
			results.forEach((res, i) => {
				console.log(`[${i + 1}] Score: ${res.score.toFixed(2)}  ${res.source_path}`);
				console.log(`    Why: ${res.why.join(', ')}`);
				console.log(`    ID:  ${res.card_id}\n`);
			});
		}

		const output = {
			query,
			limit,
			generated_at: new Date().toISOString(),
			results,
		};

		const outPath = join(OUT_DIR, 'graph_file_cards.search.json');
		writeFileSync(outPath, JSON.stringify(output, null, 2));
		console.log(`Full results written to ${outPath}`);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[kb-search] Error: ${msg}`);
		process.exit(1);
	}
}

main();
