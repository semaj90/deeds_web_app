#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchNotecards } from '../../src/lib/server/kb/search-logic.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'memory', 'kb', 'notecards');

async function main() {
  const args = process.argv.slice(2);
  let query = process.env.KB_GRAPH_SEARCH_QUERY || '';
  let limit = 10;
  let cardsPath = process.env.KB_GRAPH_CARDS_PATH || join(OUT_DIR, 'graph_file_cards.jsonl');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--query') query = args[++i];
    if (args[i] === '--limit') limit = parseInt(args[++i], 10);
    if (args[i] === '--cards') cardsPath = args[++i];
  }

  if (!query) {
    console.log('Usage: node search-graph-cards.mjs --query "string" [--limit 10]');
    return;
  }

  console.log(`[kb-search] Searching for "${query}" (limit ${limit})...`);

  try {
    const results = await searchNotecards({ query, limit, cardsPath });

    if (results.length === 0) {
      console.log('[kb-search] No matches found.');
    } else {
      console.log(`[kb-search] Found ${results.length} matches. Top results below:\n`);
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
      results
    };

    const outPath = join(OUT_DIR, 'graph_file_cards.search.json');
    writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`Full results written to ${outPath.replace(ROOT + '\\', '')}`);

  } catch (err) {
    console.error(`[kb-search] Error: ${err.message}`);
    process.exit(1);
  }
}

main();