#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { CARDS_DIR, EMBEDDINGS_DIR } from '../atlas/_neschrom-paths.mjs';

const ROOT = process.cwd();
const CANDIDATE_DIR = path.join(ROOT, '.opencode', 'candidates');

async function main() {
  let cardFiles;
  try {
    cardFiles = await fs.readdir(CARDS_DIR);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`INPUT_DIRECTORY_MISSING: ${CARDS_DIR}`);
    throw error;
  }
  cardFiles = cardFiles.filter((file) => file.endsWith('.json'));
  if (cardFiles.length === 0) throw new Error(`NO_SOURCE_CARDS: ${CARDS_DIR}`);
  const pick = [];
  for (const f of cardFiles.slice(0, 200)) {
    const c = JSON.parse(await fs.readFile(path.join(CARDS_DIR, f), 'utf8'));
    const efile = path.join(EMBEDDINGS_DIR, `${c.id}.json`);
    const emb = await fs.readFile(efile).catch(() => null);
    if (typeof c.id !== 'string' || typeof c.text !== 'string') continue;
    pick.push({ id: c.id, title: c.title, source: c.source, text: c.text, embedding: emb ? JSON.parse(emb).vector : null });
  }
  if (pick.length === 0) throw new Error('NO_PACKABLE_CARDS: source files contained no valid card bodies');
  // naive compression: only keep title + first 800 chars
  const packet = { status: 'CANDIDATE_NOT_ADMITTED', canonicalAuthority: false, created_at: new Date().toISOString(), cards: pick.map(p => ({ id: p.id, title: p.title, text: p.text.slice(0,800), source: p.source, hasVector: !!p.embedding })) };
  await fs.mkdir(CANDIDATE_DIR, { recursive: true });
  const output = path.join(CANDIDATE_DIR, `ace-packet-legacy-${packet.created_at.replace(/[:.]/g, '-')}.json`);
  await fs.writeFile(output, JSON.stringify(packet, null, 2), { encoding: 'utf8', flag: 'wx' });
  console.log('Wrote unadmitted ACE candidate ->', output);
}

main().catch(e => { console.error(e); process.exit(1); });
