#!/usr/bin/env node

/**
 * Aggregates the per-chunk JSON output produced by categorize-svelte-check-log.mjs.
 *
 * Usage:
 *   node scripts/aggregate-svelte-check-log.mjs \
 *     --chunks logs/svelte-check-post-phase19-22-all-chunks.json \
 *     --out-json logs/svelte-check-post-phase19-22-aggregate.json \
 *     --out-text logs/svelte-check-post-phase19-22-aggregate.txt
 */

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const options = {
    chunksPath: null,
    outJson: null,
    outText: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--chunks':
        options.chunksPath = argv[++i];
        break;
      case '--out-json':
        options.outJson = argv[++i];
        break;
      case '--out-text':
        options.outText = argv[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown flag ${arg}`);
        }
        break;
    }
  }

  if (!options.chunksPath) {
    throw new Error('Missing --chunks <path-to-all-chunks.json>');
  }

  if (!options.outJson) {
    options.outJson = path.join(
      path.dirname(options.chunksPath),
      `${path.basename(options.chunksPath, '.json')}-aggregate.json`,
    );
  }

  if (!options.outText) {
    options.outText = path.join(
      path.dirname(options.chunksPath),
      `${path.basename(options.chunksPath, '.json')}-aggregate.txt`,
    );
  }

  return options;
}

function printHelp() {
  console.log(`Aggregate svelte-check chunk summaries.

Usage:
  node scripts/aggregate-svelte-check-log.mjs --chunks logs/all-chunks.json [--out-json out.json] [--out-text out.txt]
`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const chunks = JSON.parse(fs.readFileSync(options.chunksPath, 'utf8'));

  const totals = { error: 0, warning: 0 };
  let processedTotal = 0;
  const buckets = new Map();

  for (const chunk of chunks) {
    processedTotal += chunk.processed || 0;
    if (chunk.totals) {
      totals.error += chunk.totals.error || 0;
      totals.warning += chunk.totals.warning || 0;
    }
    for (const category of chunk.categories || []) {
      const key = category.message;
      if (!buckets.has(key)) {
        buckets.set(key, {
          message: key,
          severity: category.severity,
          count: 0,
          samples: Array.isArray(category.samples) ? category.samples.slice(0, 3) : [],
        });
      }
      buckets.get(key).count += category.count || 0;
    }
  }

  const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
  const aggregate = {
    source: options.chunksPath,
    chunks: chunks.length,
    processed: processedTotal,
    totals,
    categories: sorted,
  };

  fs.writeFileSync(options.outJson, JSON.stringify(aggregate, null, 2));

  const lines = [];
  lines.push(
    `Aggregated ${processedTotal.toLocaleString()} diagnostics across ${chunks.length} chunks.`,
  );
  lines.push(
    `Totals: ${totals.error.toLocaleString()} errors, ${totals.warning.toLocaleString()} warnings.`,
  );
  lines.push('');
  lines.push('Top 25 categories:');
  sorted.slice(0, 25).forEach((cat, idx) => {
    lines.push(`${idx + 1}. (${cat.severity}) x${cat.count} :: ${cat.message}`);
  });

  fs.writeFileSync(options.outText, lines.join('\n'));
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
