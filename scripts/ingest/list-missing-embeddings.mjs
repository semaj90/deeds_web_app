#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const CARDS_DIR = path.join(ROOT, '.opencode', 'cards');
const EMB_DIR = path.join(ROOT, '.opencode', 'embeddings');
const OUT_DIR = path.join(ROOT, '.tmp');
await fs.mkdir(OUT_DIR, { recursive: true });

async function listJsonFiles(dir) {
  try { const files = await fs.readdir(dir); return files.filter(f => f.endsWith('.json')); } catch { return []; }
}

function readJsonSafe(p) { return fs.readFile(p, 'utf8').then(JSON.parse).catch(() => null); }

async function run() {
  const cardFiles = await listJsonFiles(CARDS_DIR);
  const missing = [];
  for (const f of cardFiles) {
    const j = await readJsonSafe(path.join(CARDS_DIR, f));
    // skip invalid/json index files
    if (!j || Array.isArray(j)) continue;
    if (j.metadata && j.metadata.quarantined === true) continue;
    const emb = await readJsonSafe(path.join(EMB_DIR, `${j.id}.json`));
    if (!emb || !Array.isArray(emb.vector)) missing.push(j.id);
  }
  const outPath = path.join(OUT_DIR, 'missing-embeddings.json');
  await fs.writeFile(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), missing }, null, 2));
  console.log('Missing embeddings written to', outPath);
  console.log(JSON.stringify({ missingCount: missing.length, sample: missing.slice(0,10) }, null, 2));
}

run().catch(e => { console.error('Failed to list missing embeddings', e); process.exit(1); });
