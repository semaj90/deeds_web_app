#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const EMB_DIR = path.join(ROOT, '.opencode', 'embeddings');
const OUT_DIR = path.join(ROOT, '.tmp');
await fs.mkdir(OUT_DIR, { recursive: true });

async function listJsonFiles(dir) {
  try { return (await fs.readdir(dir)).filter(f => f.endsWith('.json')); }
  catch { return []; }
}

async function run() {
  const files = await listJsonFiles(EMB_DIR);
  let total = 0, ok = 0, bad = 0, missing = 0;
  const badExamples = [];

  for (const f of files) {
    const p = path.join(EMB_DIR, f);
    let j = null;
    total++;
    try {
      const txt = await fs.readFile(p, 'utf8');
      j = JSON.parse(txt);
    } catch (e) {
      missing++;
      badExamples.push({ file: f, reason: 'invalid-json' });
      continue;
    }

    const vec = j && j.vector;
    if (!Array.isArray(vec)) { missing++; badExamples.push({ id: j?.id || f, reason: 'missing-vector' }); continue; }
    if (vec.length === 768) { ok++; }
    else { bad++; badExamples.push({ id: j.id || f, len: vec.length }); }
  }

  const report = { generatedAt: new Date().toISOString(), totalFiles: total, ok, bad, missing, badExamples };
  const outPath = path.join(OUT_DIR, 'qdrant-dim-smoke.json');
  await fs.writeFile(outPath, JSON.stringify(report, null, 2));
  console.log('Wrote', outPath);
  console.log(JSON.stringify(report, null, 2));
}

run().catch(err => { console.error('FATAL:', err); process.exit(1); });
