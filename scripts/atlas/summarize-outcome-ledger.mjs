#!/usr/bin/env node
/**
 * summarize-outcome-ledger.mjs
 *
 * Reads .opencode/outcome-ledger.ndjson and prints a concise summary:
 *   - total rows
 *   - rows by source
 *   - reward distribution (min/avg/max, % null)
 *   - top reward_reasons
 *   - recent 5 rows
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEDGER = path.join(__dirname, '../../.opencode/outcome-ledger.ndjson');

if (!existsSync(LEDGER)) {
  console.error(`Ledger not found: ${LEDGER}`);
  process.exit(1);
}

const lines = readFileSync(LEDGER, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean);

const total = lines.length;
if (total === 0) {
  console.log('Ledger is empty.');
  process.exit(0);
}

// By source
const bySrc = {};
for (const row of lines) {
  const src = row.source ?? row.who ?? '(unknown)';
  bySrc[src] = (bySrc[src] ?? 0) + 1;
}

// Reward stats
const rewards = lines.map((r) => r.reward).filter((r) => typeof r === 'number');
const nullCount = total - rewards.length;
const avg = rewards.length ? rewards.reduce((a, b) => a + b, 0) / rewards.length : null;
const minR = rewards.length ? Math.min(...rewards) : null;
const maxR = rewards.length ? Math.max(...rewards) : null;

// Top reward_reasons
const reasonCounts = {};
for (const row of lines) {
  if (row.reward_reason) {
    reasonCounts[row.reward_reason] = (reasonCounts[row.reward_reason] ?? 0) + 1;
  }
}
const topReasons = Object.entries(reasonCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);

// Recent 5
const recent = lines.slice(-5).reverse();

console.log('\n=== Outcome Ledger Summary ===');
console.log(`Total rows : ${total}`);
console.log(`\nBy source:`);
for (const [src, count] of Object.entries(bySrc).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${src.padEnd(30)} ${count}`);
}

console.log(`\nReward distribution (${rewards.length} scored, ${nullCount} null):`);
if (rewards.length) {
  console.log(`  min=${minR.toFixed(3)}  avg=${avg.toFixed(3)}  max=${maxR.toFixed(3)}`);
  const buckets = [0, 0, 0, 0, 0]; // 0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0
  for (const r of rewards) buckets[Math.min(4, Math.floor(r * 5))]++;
  const labels = ['0.0-0.2', '0.2-0.4', '0.4-0.6', '0.6-0.8', '0.8-1.0'];
  for (let i = 0; i < 5; i++) {
    const bar = '█'.repeat(Math.round((buckets[i] / rewards.length) * 20));
    console.log(`  [${labels[i]}] ${bar} (${buckets[i]})`);
  }
}

if (topReasons.length) {
  console.log('\nTop reward_reasons:');
  for (const [reason, count] of topReasons) {
    console.log(`  ${count.toString().padStart(3)}x  ${reason}`);
  }
}

console.log('\nMost recent 5 rows:');
for (const row of recent) {
  const ts = row.ts ?? row.timestamp ?? '?';
  const src = row.source ?? row.who ?? '?';
  const intent = typeof row.intent === 'string' ? row.intent.slice(0, 40) : '?';
  const reward = row.reward != null ? row.reward.toFixed(3) : 'null';
  console.log(`  [${ts.slice(0, 19)}] ${src} | ${intent} | reward=${reward}`);
}
console.log('');
