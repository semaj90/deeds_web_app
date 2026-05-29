#!/usr/bin/env node
import fs from 'fs/promises';
import { statSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = process.cwd();
const EMB_DIR = path.join(ROOT, '.opencode', 'embeddings');
const DIM = 768;

function pseudoEmbed(text) {
  let seed = crypto.createHash('sha256').update(String(text)).digest();
  const out = new Float32Array(DIM);
  for (let i = 0; i < DIM; i++) {
    seed = crypto.createHash('sha256').update(seed).digest();
    out[i] = (seed.readUInt32BE(0) / 0xffffffff) * 2 - 1;
  }
  return Array.from(out);
}

async function main() {
  const files = await fs.readdir(EMB_DIR).catch(() => []);
  let fixed = 0;
  for (const f of files) {
    if (!/\.json$/.test(f)) continue;
    const p = path.join(EMB_DIR, f);
    let size = 0;
    try { size = statSync(p).size; } catch { continue; }
    if (size > 0) continue;
    // empty file: try to recover by reading corresponding card
    const id = f.replace(/\.json$/, '');
    const cardsDir = path.join(ROOT, '.opencode', 'cards');
    try {
      const cardRaw = await fs.readFile(path.join(cardsDir, `${id}.json`), 'utf8');
      const card = JSON.parse(cardRaw);
      const text = card.text || card.title || id;
      const vector = pseudoEmbed(text);
      const out = { id, vector, metadata: { title: card.title, source: card.source }, source: 'repaired-pseudo', dim: DIM };
      await fs.writeFile(p, JSON.stringify(out), 'utf8');
      fixed++;
      console.log('Fixed empty embed:', f);
    } catch (e) {
      console.warn('Could not fix', f, e.message);
    }
  }
  console.log(`Done. Repaired ${fixed} empty embeddings.`);
}

main().catch(e => { console.error(e); process.exit(1); });
