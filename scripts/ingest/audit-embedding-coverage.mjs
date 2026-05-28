#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const CARDS_DIR = path.join(ROOT, '.opencode', 'cards');
const EMB_DIR = path.join(ROOT, '.opencode', 'embeddings');
const OUT_DIR = path.join(ROOT, '.tmp');
await fs.mkdir(OUT_DIR, { recursive: true });

async function listJsonFiles(dir) {
  try {
    const files = await fs.readdir(dir);
    return files.filter(f => f.endsWith('.json'));
  } catch (err) {
    return [];
  }
}

function readJsonSafe(p) {
  return fs.readFile(p, 'utf8').then(JSON.parse).catch(() => null);
}

async function run() {
  const cardFiles = await listJsonFiles(CARDS_DIR);
  const totalCards = cardFiles.length;

  let validNonQuarantined = 0;
  let embeddedCount = 0;
  let badDimCount = 0;
  const badDimExamples = [];
  const embeddedList = [];

  for (const f of cardFiles) {
    const p = path.join(CARDS_DIR, f);
    const j = await readJsonSafe(p);
    if (!j) continue;
    const quarantined = j.metadata && j.metadata.quarantined === true;
    if (quarantined) continue;
    validNonQuarantined++;
    const embPath = path.join(EMB_DIR, `${j.id}.json`);
    const emb = await readJsonSafe(embPath);
    if (emb && Array.isArray(emb.vector)) {
      embeddedCount++;
      embeddedList.push({ id: j.id, len: emb.vector.length });
      if (emb.vector.length !== 768) {
        badDimCount++;
        if (badDimExamples.length < 10) badDimExamples.push({ id: j.id, len: emb.vector.length });
      }
    }
  }

  const missingEmbeddings = validNonQuarantined - embeddedCount;
  const coveragePct = validNonQuarantined === 0 ? 0 : Math.round((embeddedCount / validNonQuarantined) * 10000) / 100;

  const report = {
    generatedAt: new Date().toISOString(),
    totalCards,
    validNonQuarantined,
    embeddedCount,
    missingEmbeddings,
    badDimCount,
    coveragePct,
    badDimExamples,
  };

  const outPath = path.join(OUT_DIR, 'embedding-coverage-report.json');
  await fs.writeFile(outPath, JSON.stringify(report, null, 2));

  console.log('Embedding coverage audit complete. Report written to', outPath);
  console.log(JSON.stringify(report, null, 2));
}

run().catch(err => {
  console.error('FATAL: audit failed', err);
  process.exit(1);
});
