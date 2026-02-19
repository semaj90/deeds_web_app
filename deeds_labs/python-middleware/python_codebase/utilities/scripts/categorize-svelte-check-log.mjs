#!/usr/bin/env node

/**
 * Chunked categorizer for giant svelte-check logs.
 *
 * Usage examples:
 *   node scripts/categorize-svelte-check-log.mjs --log sveltekit-frontend/svelte-check-post-phase19-22.log
 *   node scripts/categorize-svelte-check-log.mjs --log path/to/log --skip 10000 --limit 10000
 *
 * The script streams the log, extracts up to N diagnostics (default 10k),
 * normalises their messages, and prints a frequency table so we can see
 * which error classes dominate the output.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const ANSI_REGEX = /\u001b\[[0-9;]*m/g;
const DEFAULT_LIMIT = 10_000;

function parseArgs(argv) {
  const options = {
    logPath: null,
    limit: DEFAULT_LIMIT,
    skip: 0,
    json: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--log':
      case '--logPath':
        options.logPath = argv[++i];
        break;
      case '--limit':
        options.limit = Number(argv[++i] ?? DEFAULT_LIMIT);
        break;
      case '--skip':
        options.skip = Number(argv[++i] ?? 0);
        break;
      case '--json':
        options.json = true;
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

  if (!options.logPath) {
    throw new Error('Please pass --log <path-to-svelte-check-log>');
  }

  return options;
}

function printHelp() {
  console.log(`Chunked svelte-check log categorizer

Usage:
  node scripts/categorize-svelte-check-log.mjs --log sveltekit-frontend/svelte-check.log [--skip 0] [--limit 10000] [--json]

Options:
  --log     Path to the svelte-check log file to analyse
  --skip    Number of diagnostics to ignore before counting (default 0)
  --limit   Max diagnostics to categorise (default 10,000)
  --json    Emit JSON instead of a human summary
`);
}

function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripAnsi(input) {
  return input.replace(ANSI_REGEX, '');
}

function normaliseMessage(message, repoRoot) {
  let normalised = message.replace(/\\/g, '/');
  if (repoRoot) {
    const repoRegex = new RegExp(escapeRegex(repoRoot), 'gi');
    normalised = normalised.replace(repoRegex, '<repo>');
  }

  // Collapse absolute Windows drive paths that might still survive.
  normalised = normalised.replace(/[A-Za-z]:\/[^:\s]+/g, '<path>');

  // Replace vite-preprocess artefacts (hashed temp file names)
  normalised = normalised.replace(/\.vite-preprocess\.[a-z0-9-]+/gi, '.vite-preprocess.<hash>');

  // Remove bare line/column numbers that would fragment buckets.
  normalised = normalised.replace(/:(\d+)/g, ':<n>');
  normalised = normalised.replace(/\b\d+\b/g, '<n>');

  // Trim duplicate whitespace.
  normalised = normalised.replace(/\s+/g, ' ').trim();
  return normalised;
}

function extractDiagnostic(line) {
  if (!line) return null;

  if (line.startsWith('CssSyntaxError:')) {
    return { severity: 'error', message: line };
  }

  if (line.startsWith('CssSyntaxWarning:')) {
    return { severity: 'warning', message: line };
  }

  const errorIdx = line.indexOf('Error:');
  if (errorIdx !== -1) {
    return { severity: 'error', message: line.slice(errorIdx + 6).trim() };
  }

  const warningIdx = line.indexOf('Warning:');
  if (warningIdx !== -1) {
    return { severity: 'warning', message: line.slice(warningIdx + 8).trim() };
  }

  return null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const resolvedLog = path.resolve(options.logPath);
  if (!fs.existsSync(resolvedLog)) {
    throw new Error(`Log file not found: ${resolvedLog}`);
  }

  const repoRoot = process.cwd().replace(/\\/g, '/');
  const stats = {
    processed: 0,
    skipped: 0,
    totals: { error: 0, warning: 0 }
  };
  const buckets = new Map();

  const rl = readline.createInterface({
    input: fs.createReadStream(resolvedLog),
    crlfDelay: Infinity
  });

  for await (const rawLine of rl) {
    const cleanLine = stripAnsi(rawLine).trim();
    if (!cleanLine) continue;

    const diagnostic = extractDiagnostic(cleanLine);
    if (!diagnostic) continue;

    if (stats.skipped < options.skip) {
      stats.skipped += 1;
      continue;
    }

    stats.processed += 1;
    stats.totals[diagnostic.severity] += 1;

    const key = normaliseMessage(diagnostic.message, repoRoot);
    if (!buckets.has(key)) {
      buckets.set(key, {
        severity: diagnostic.severity,
        count: 0,
        samples: [diagnostic.message]
      });
    }
    const bucket = buckets.get(key);
    bucket.count += 1;
    if (bucket.samples.length < 3 && !bucket.samples.includes(diagnostic.message)) {
      bucket.samples.push(diagnostic.message);
    }

    if (stats.processed >= options.limit) {
      break;
    }
  }

  const sorted = Array.from(buckets.entries()).sort((a, b) => b[1].count - a[1].count);

  if (options.json) {
    console.log(JSON.stringify({
      logPath: resolvedLog,
      limit: options.limit,
      skip: options.skip,
      processed: stats.processed,
      totals: stats.totals,
      categories: sorted.map(([message, info]) => ({
        message,
        severity: info.severity,
        count: info.count,
        samples: info.samples
      }))
    }, null, 2));
    return;
  }

  console.log(`Analysed ${stats.processed.toLocaleString()} diagnostics from ${resolvedLog}`);
  console.log(`Totals: ${stats.totals.error.toLocaleString()} errors, ${stats.totals.warning.toLocaleString()} warnings`);
  console.log('');
  console.log('Top categories:');
  sorted.slice(0, 20).forEach(([message, info], index) => {
    console.log(`${index + 1}. (${info.severity}) x${info.count}`);
    console.log(`   ${message}`);
    if (info.samples.length) {
      console.log(`   e.g. ${info.samples[0]}`);
    }
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
