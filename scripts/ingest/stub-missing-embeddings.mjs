#!/usr/bin/env node
/**
 * stub-missing-embeddings.mjs
 * Fills embedding gaps with deterministic pseudo-vectors (SHA-256 stream → float32).
 * Stubs are tagged source:'pseudo' so real Ollama embeds can overwrite them later.
 * Only writes files that don't already exist — safe to re-run.
 *
 * Usage:
 *   node scripts/ingest/stub-missing-embeddings.mjs
 *   node scripts/ingest/stub-missing-embeddings.mjs --dry-run
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT     = process.cwd();
const CARDS    = path.join(ROOT, '.opencode', 'cards');
const EMB_DIR  = path.join(ROOT, '.opencode', 'embeddings');
const DRY_RUN  = process.argv.includes('--dry-run');
const DIM      = 768;

function pseudoEmbed(text) {
  let seed = crypto.createHash('sha256').update(String(text)).digest();
  const out = new Float32Array(DIM);
  for (let i = 0; i < DIM; i++) {
    seed   = crypto.createHash('sha256').update(seed).digest();
    out[i] = (seed.readUInt32BE(0) / 0xffffffff) * 2 - 1;
  }
  return Array.from(out);
}

async function main() {
  console.log('\n── Stub Missing Embeddings ───────────────────────────────');

  const cardFiles = await fs.readdir(CARDS).catch(() => []);
  const jsonCards = cardFiles.filter(f => /\.json$/.test(f));

  // Build set of already-embedded ids
  const embFiles = await fs.readdir(EMB_DIR).catch(() => []);
  const embedded = new Set(
    embFiles.filter(f => /\.json$/.test(f)).map(f => f.replace(/\.json$/, ''))
  );

  console.log(`  cards      : ${jsonCards.length}`);
  console.log(`  embedded   : ${embedded.size}`);

  const missing = [];
  for (const f of jsonCards) {
    let card;
    try { card = JSON.parse(await fs.readFile(path.join(CARDS, f), 'utf8')); } catch { continue; }
    const id = card.id;
    if (!id || embedded.has(id)) continue;
    missing.push({ id, text: card.text || card.title || id, source: card.source || '' });
  }

  console.log(`  to stub    : ${missing.length}${DRY_RUN ? '  [dry-run]' : ''}`);

  if (DRY_RUN) {
    console.log(`\n  dry-run: would write ${missing.length} pseudo-embed stubs`);
    console.log('──────────────────────────────────────────────────────────\n');
    return;
  }

  await fs.mkdir(EMB_DIR, { recursive: true });
  let written = 0;
  const BATCH = 200;
  for (let i = 0; i < missing.length; i++) {
    const { id, text } = missing[i];
    const outPath = path.join(EMB_DIR, `${id}.json`);
    if (existsSync(outPath)) continue; // real embed arrived between scan and write
    const vector = pseudoEmbed(text);
    await fs.writeFile(outPath, JSON.stringify({ id, vector, source: 'pseudo', dim: DIM }), 'utf8');
    written++;
    if (written % BATCH === 0) process.stdout.write(`\r  written: ${written}/${missing.length} `);
  }
  if (written > 0) process.stdout.write('\n');

  console.log(`\n  ✅ stubbed ${written} embeddings (pseudo-embed, source:'pseudo')`);
  console.log(`  total coverage: ${embedded.size + written} / ${jsonCards.length}`);
  console.log('──────────────────────────────────────────────────────────\n');
}

main().catch(e => { console.error(e); process.exit(1); });