#!/usr/bin/env node
import fs from 'fs';
const out = 'sveltekit-frontend/tmp/embeddings-smoke.ndjson';
const N = 500;
const D = 32;
fs.mkdirSync('sveltekit-frontend/tmp', { recursive: true });
const w = fs.createWriteStream(out);
for (let i = 0; i < N; i++) {
  const vec = Array.from({ length: D }, () => Math.random());
  w.write(JSON.stringify({ id: `v${i}`, embedding: vec }) + '\n');
}
w.end();
console.log('WROTE', out);
