#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const CARDS_DIR = path.join(ROOT, '.opencode', 'cards');
const EMB_DIR = path.join(ROOT, '.opencode', 'embeddings');
const OUT_DIR = path.join(ROOT, '.tmp');
await fs.mkdir(OUT_DIR, { recursive: true });

async function listJsonFiles(dir) { try { const files = await fs.readdir(dir); return files.filter(f => f.endsWith('.json')); } catch { return []; } }
function readJsonSafe(p) { return fs.readFile(p, 'utf8').then(JSON.parse).catch(() => null); }

async function run() {
  const cardFiles = await listJsonFiles(CARDS_DIR);
  const problems = [];
  for (const f of cardFiles) {
    const cardPath = path.join(CARDS_DIR, f);
    const j = await readJsonSafe(cardPath);
    if (!j || Array.isArray(j)) { /* skip index/invalid files */ continue; }
    if (j.metadata && j.metadata.quarantined === true) continue;
    if (!j.id) { problems.push({ file: f, id: null, reason: 'missing-id' }); continue; }
    const emb = await readJsonSafe(path.join(EMB_DIR, `${j.id}.json`));
    if (!emb || !Array.isArray(emb.vector)) problems.push({ file: f, id: j.id, reason: 'missing-embed' });
  }
  const outPath = path.join(OUT_DIR, 'missing-embeddings-verbose.json');
  await fs.writeFile(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), problems }, null, 2));
  console.log('Wrote verbose report to', outPath);
  console.log(JSON.stringify({ problemsCount: problems.length, sample: problems.slice(0,10) }, null, 2));
}

run().catch(e => { console.error('Failed', e); process.exit(1); });
