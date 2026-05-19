#!/usr/bin/env node
/**
 * Generate GRPO-style JSONL datasets from graphify deep ingest artifacts.
 *
 * Usage:
 *   node scripts/generate-graphify-grpo-dataset.mjs [--output-dir <dir>]
 *
 * Output files:
 *   scripts/training-datasets/graphify-deep-supervised.jsonl
 *   scripts/training-datasets/graphify-deep-grpo.jsonl
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const outputDir = args.includes('--output-dir')
  ? args[args.indexOf('--output-dir') + 1]
  : 'scripts/training-datasets';
const deepDir = path.join('sveltekit-frontend', 'memory', 'graphify', 'deep');
const unresolvedPath = path.join(deepDir, 'unresolved-imports.json');
const summaryPath = path.join(deepDir, 'graphify-deep-summary.md');

function writeJsonl(filePath, records) {
  const lines = records.map((r) => JSON.stringify(r)).join('\n');
  fs.writeFileSync(filePath, lines + '\n', 'utf8');
  console.log(`Written: ${filePath} (${records.length} records)`);
}

if (!fs.existsSync(unresolvedPath)) {
  console.error(`Missing file: ${unresolvedPath}`);
  process.exit(1);
}

const unresolved = JSON.parse(fs.readFileSync(unresolvedPath, 'utf8'));
const summary = fs.existsSync(summaryPath)
  ? fs.readFileSync(summaryPath, 'utf8').split('\n').slice(0, 80).join('\n')
  : '';

const unresolvedEntries = Object.entries(unresolved)
  .map(([key, sources]) => ({ key, sources: Array.isArray(sources) ? sources : [] }))
  .sort((a, b) => b.sources.length - a.sources.length)
  .slice(0, 8);

const recordsSupervised = [];
const recordsGrpo = [];

for (const entry of unresolvedEntries) {
  const prompt = `Diagnose why graphify:deep:ingest failed and recommend the safest fix. Use only repository-safe commands and preserve existing indexes.`;
  const acePacket = {
    hits: entry.sources.slice(0, 6).map((rel) => ({
      chunk_id: rel,
      weight: 0.92,
      why: `Unresolved import target or build dependency for ${path.basename(rel)}`,
    })),
    graph_edges: ['imports', 'unresolved_imports', 'output_path'],
    root_issue: entry.key,
  };

  const answer = `The deep import ingest failed while writing ${path.basename(entry.key)} for unresolved imports. Create or repair the output directory under \\sveltekit-frontend\\memory\\graphify\\deep, clear any read-only flag, and rerun the ingest task. For example:\n\n` +
    'mkdir "sveltekit-frontend\\memory\\graphify\\deep" --parent\n' +
    'attrib -R "sveltekit-frontend\\memory\\graphify\\deep"\n' +
    'cd sveltekit-frontend\n' +
    'npm run graphify:deep:ingest\n\n' +
    'This avoids a heavy reindex and fixes the immediate file-write failure.';

  recordsSupervised.push({
    prompt: `User asks: Why does graphify:deep:ingest fail writing ${path.basename(entry.key)}?`,
    ace_packet: acePacket,
    answer,
  });

  const good = answer;
  const bad = `The deep ingest failed because the graph is broken. You should re-run graphify later or delete the bad files and retry.`;

  recordsGrpo.push({
    prompt: `Diagnose this repo error and give the safest fix for a graphify deep ingest failure.`,
    completion_a: good,
    completion_b: bad,
    reward: {
      correct_fix: 1,
      uses_evidence: 1,
      safe_no_heavy_reindex: 1,
      concise: 1,
    },
  });
}

fs.mkdirSync(outputDir, { recursive: true });
writeJsonl(path.join(outputDir, 'graphify-deep-supervised.jsonl'), recordsSupervised);
writeJsonl(path.join(outputDir, 'graphify-deep-grpo.jsonl'), recordsGrpo);

if (summary) {
  fs.writeFileSync(path.join(outputDir, 'graphify-deep-summary.txt'), summary, 'utf8');
  console.log(`Written summary excerpt to graphify-deep-summary.txt`);
}

console.log('GRPO dataset generation complete.');
