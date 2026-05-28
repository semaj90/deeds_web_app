#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const ROOT = process.cwd();
const CARDS_DIR = path.join(ROOT, '.opencode', 'cards');
const OUT_DIR = path.join(ROOT, '.opencode', 'embeddings');

await fs.mkdir(OUT_DIR, { recursive: true });

function pseudoEmbedding(text, dim = 768) {
  // Deterministic pseudo-embedding: SHA256 stream -> floats
  const out = new Float32Array(dim);
  let seed = crypto.createHash('sha256').update(text).digest();
  for (let i = 0; i < dim; i++) {
    // expand seed
    seed = crypto.createHash('sha256').update(seed).digest();
    // use first 4 bytes as uint32
    const v = seed.readUInt32BE(0);
    out[i] = ((v / 0xffffffff) * 2) - 1; // -1..1
  }
  return Array.from(out);
}

async function run() {
  const files = await fs.readdir(CARDS_DIR).catch(() => []);
  let count = 0;
  for (const f of files) {
    if (!/\.json$/.test(f)) continue;
    const p = path.join(CARDS_DIR, f);
    const j = JSON.parse(await fs.readFile(p, 'utf8'));
    const vec = pseudoEmbedding(j.text);
    const out = { id: j.id, vector: vec, metadata: { title: j.title, source: j.source } };
    await fs.writeFile(path.join(OUT_DIR, `${j.id}.json`), JSON.stringify(out));
    count++;
  }
  console.log('Embedded', count, 'cards ->', OUT_DIR);
}

run().catch(e => { console.error(e); process.exit(1); });
