#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const CARDS_DIR = path.join(ROOT, '.opencode', 'cards');
const EMB_DIR = path.join(ROOT, '.opencode', 'embeddings');
const OUT = path.join(ROOT, '.opencode', 'ace-packet.json');

async function main() {
  const cardFiles = await fs.readdir(CARDS_DIR).catch(() => []);
  const pick = [];
  for (const f of cardFiles.slice(0, 200)) {
    if (!/\.json$/.test(f)) continue;
    const c = JSON.parse(await fs.readFile(path.join(CARDS_DIR, f), 'utf8'));
    const efile = path.join(EMB_DIR, `${c.id}.json`);
    const emb = await fs.readFile(efile).catch(() => null);
    pick.push({ id: c.id, title: c.title, source: c.source, text: c.text, embedding: emb ? JSON.parse(emb).vector : null });
  }
  // naive compression: only keep title + first 800 chars
  const packet = { created_at: new Date().toISOString(), cards: pick.map(p => ({ id: p.id, title: p.title, text: p.text.slice(0,800), source: p.source, hasVector: !!p.embedding })) };
  await fs.writeFile(OUT, JSON.stringify(packet, null, 2), 'utf8');
  console.log('Wrote ACE packet ->', OUT);
}

main().catch(e => { console.error(e); process.exit(1); });
