#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const FILES = [
  'memory/index/ace-prefix.toon',
  'memory/cards/selected-cards.toon',
  'memory/cards/top-100-codebase-summary-cards.toon',
  'memory/cards/top-100-codebase-summary-cards.json',
  'docs/reports/top-100-codebase-summary-cards.md',
];

function main() {
  const missing = FILES.filter((file) => !existsSync(resolve(ROOT, file)));
  if (missing.length > 0) {
    throw new Error(`missing prompt-cache artifacts: ${missing.join(', ')}`);
  }

  const acePrefix = readFileSync(resolve(ROOT, 'memory/index/ace-prefix.toon'), 'utf8').trim();
  const summaryToon = readFileSync(resolve(ROOT, 'memory/cards/top-100-codebase-summary-cards.toon'), 'utf8').trim();
  const selectedToon = readFileSync(resolve(ROOT, 'memory/cards/selected-cards.toon'), 'utf8').trim();

  if (!acePrefix || !summaryToon || !selectedToon) {
    throw new Error('one or more TOON prompt-cache files are empty');
  }

  console.log(JSON.stringify({
    ok: true,
    files: FILES,
    lengths: {
      acePrefix: acePrefix.length,
      summaryToon: summaryToon.length,
      selectedToon: selectedToon.length,
    },
    preview: {
      acePrefix: acePrefix.slice(0, 120),
      summaryToon: summaryToon.slice(0, 120),
    },
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`[prompt:cache:verify] ${error?.message ?? String(error)}`);
  process.exit(1);
}
