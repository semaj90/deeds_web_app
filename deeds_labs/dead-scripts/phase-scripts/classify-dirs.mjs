#!/usr/bin/env node
import { readFileSync } from 'fs';

const SEP = '\\';

function analyze(file, label) {
  const lines = readFileSync(file, 'utf8').trim().split('\n').filter(l => l.endsWith('.ts'));
  const dirs = {};
  for (const l of lines) {
    const norm = l.split(SEP).join('/');
    const parts = norm.split('/');
    const key = parts.slice(0, Math.min(3, parts.length - 1)).join('/');
    dirs[key] = (dirs[key] || 0) + 1;
  }
  console.log(`=== ${label} ===`);
  Object.entries(dirs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));
  console.log();
}

analyze('unreachable-corrupted.txt', 'CORRUPTED .ts (234) — by directory');
analyze('unreachable-stub.txt', 'STUB .ts (213) — by directory');
analyze('unreachable-clean.txt', 'CLEAN .ts (585) — by directory');