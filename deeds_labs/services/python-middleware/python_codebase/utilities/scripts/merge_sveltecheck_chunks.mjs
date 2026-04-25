#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const CACHE = '.cache';
const OUT = path.join(CACHE, 'sveltecheck.trimmed.json');

function main() {
  if (!fs.existsSync(CACHE)) {
    console.error('No .cache directory found');
    process.exit(1);
  }

  const files = fs.readdirSync(CACHE)
    .filter((f) => f.startsWith('sveltecheck.chunk.') && f.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    console.error('No chunk files found in .cache');
    process.exit(1);
  }

  const diagnostics = [];
  for (const file of files) {
    const p = path.join(CACHE, file);
    try {
      const txt = fs.readFileSync(p, 'utf8');
      const arr = JSON.parse(txt);
      if (Array.isArray(arr)) diagnostics.push(...arr);
      else console.warn(`Skipping ${file}: not an array`);
    } catch (err) {
      console.warn(`Failed to parse ${file}: ${err.message}`);
    }
  }

  const out = { diagnostics, count: diagnostics.length };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Wrote ${OUT} (${diagnostics.length} diagnostics, ${files.length} chunks)`);
}

main();
