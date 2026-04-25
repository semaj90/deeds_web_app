#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE_DIR = '.cache';
const REPORT_TXT = join(CACHE_DIR, 'phase49-duplicates.txt');
const REPORT_JSON = join(CACHE_DIR, 'phase49-duplicates.json');

if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}

function run(cmd, args, label) {
  console.log(`\n🛠️  ${label}: ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) {
    console.error(`⚠️  ${label} failed: ${result.error.message}`);
  }
  return result.status ?? 0;
}

function capture(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  return result.stdout ?? '';
}

console.log('🧠 Phase49 Duplicate Analyzer');

const duplicateLines = capture('rg', ['--no-heading', '--no-line-number', '-I', '.', 'sveltekit-frontend']);
const normalized = duplicateLines
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .sort();

const dupCounts = new Map();
for (const line of normalized) {
  dupCounts.set(line, (dupCounts.get(line) ?? 0) + 1);
}

const duplicates = [...dupCounts.entries()].filter(([, count]) => count > 1);

const scriptBlocks = capture('rg', ['-oUPz', '(?s)<script.*?</script>', 'sveltekit-frontend']);
const functions = capture('rg', ['-o', 'function\\s+[A-Za-z_]+', 'sveltekit-frontend']);

const report = {
  generatedAt: new Date().toISOString(),
  duplicateLineCount: duplicates.length,
  duplicateLines: duplicates.map(([line, count]) => ({ count, line })),
  scriptBlocksLength: scriptBlocks.length,
  functionMatches: functions
    .split('\n')
    .filter(Boolean)
    .reduce((acc, fn) => {
      acc[fn] = (acc[fn] ?? 0) + 1;
      return acc;
    }, {})
};

writeFileSync(REPORT_TXT, duplicates.map(([line, count]) => `${count} × ${line}`).join('\n') + '\n', 'utf8');
writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');

console.log(`📄 Duplicate line report: ${REPORT_TXT}`);
console.log(`📊 Structured report: ${REPORT_JSON}`);
console.log('ℹ️  For a quick on-screen summary, run:');
console.log("   rg -o 'function\\s+[A-Za-z_]+' sveltekit-frontend | sort | uniq -c | sort -nr | head");
