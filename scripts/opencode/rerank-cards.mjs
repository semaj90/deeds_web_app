#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const packetPath = argv.find(a => a.startsWith('--packet='))?.split('=')[1] || '.opencode/ace-packet.json';

function loadPacket(p) {
  try {
    const raw = fs.readFileSync(path.resolve(p), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read packet', p, e.message);
    process.exit(1);
  }
}

function simulateRerank(cards) {
  // Simple dry-run: sort by combined signals (semantic * 0.6 + recency * 0.3 + errorBoost * 0.1)
  return cards.map(c => {
    const s = c.signals || {};
    const semantic = typeof s.semantic === 'number' ? s.semantic : 0;
    const recency = typeof s.recency === 'number' ? s.recency : 0;
    const errorBoost = typeof s.errorBoost === 'number' ? s.errorBoost : 1;
    const score = semantic * 0.6 + recency * 0.3 + errorBoost * 0.1;
    return { id: c.id, title: c.title || '', oldScore: c.score || 0, newScore: score };
  }).sort((a,b) => b.newScore - a.newScore);
}

async function main() {
  console.log('rerank-cards.mjs — dry-run:', dryRun);
  const packet = loadPacket(packetPath);
  const cards = packet.cards || [];
  if (!cards.length) {
    console.log('No cards found in packet:', packetPath);
    process.exit(0);
  }

  console.log('Loaded', cards.length, 'cards from', packetPath);

  const beforeTop = cards.slice(0,10).map(c => ({ id: c.id, title: c.title, score: c.score }));
  console.log('\nTop 10 (before):');
  beforeTop.forEach((c,i) => console.log(`${i+1}. ${c.id} — ${c.title} (score=${c.score})`));

  const reranked = simulateRerank(cards);
  const afterTop = reranked.slice(0,10);
  console.log('\nTop 10 (simulated after):');
  afterTop.forEach((c,i) => console.log(`${i+1}. ${c.id} — ${c.title} (newScore=${c.newScore.toFixed(4)} old=${c.oldScore})`));

  const moved = [];
  for (let i=0;i<afterTop.length;i++) {
    const old = beforeTop.findIndex(b => b.id === afterTop[i].id);
    if (old !== i && old !== -1) moved.push({ id: afterTop[i].id, from: old+1, to: i+1 });
  }
  console.log('\nMoved in top 10:', moved.length);
  moved.slice(0,20).forEach(m => console.log(`- ${m.id}: ${m.from} -> ${m.to}`));

  if (dryRun) {
    console.log('\nDry-run complete — no changes written.');
    process.exit(0);
  }

  // Non-dry-run: would write results or call upsert; we avoid side effects here.
  console.log('Non-dry-run mode would apply rerank changes (not implemented in this safe script).');
}

main().catch(err => { console.error(err); process.exit(1); });
