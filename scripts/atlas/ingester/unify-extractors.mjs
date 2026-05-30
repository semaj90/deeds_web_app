#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Use process.cwd() as the repo root for reliability on Windows
const ROOT = process.cwd();
const CARDS_DIR = path.join(ROOT, '.opencode', 'cards');
const OUT_DIR = path.join(ROOT, '.tmp', 'ingest');

function ensureOut() { fs.mkdirSync(OUT_DIR, { recursive: true }); }

function readCards() {
  if (!fs.existsSync(CARDS_DIR)) return [];
  return fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json')).map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(CARDS_DIR, f), 'utf8')); }
    catch (e) { return null; }
  }).filter(Boolean);
}

function discoverNDJSON(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.ndjson') || f.endsWith('.jsonl')).map(f => path.join(dir, f));
}

function readNDJSON(file) {
  const s = fs.readFileSync(file, 'utf8');
  return s.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function toNode(card) {
  return {
    id: card.id || card.cardId || card.uid || null,
    type: 'card',
    title: card.title || card.name || '',
    sourceRef: card.sourceRef || card.path || null,
    graphVersion: card.graphVersion || '1',
    payload: card,
  };
}

function toEdge(fromId, toId, kind='relates_to') {
  return { from: fromId, to: toId, kind };
}

function writeNDJSON(list, file) {
  const out = list.map(l => JSON.stringify(l)).join('\n') + '\n';
  fs.writeFileSync(file, out, 'utf8');
}

async function main() {
  console.log('Ingest: unify extractors → canonical nodes/edges');
  ensureOut();

  const cards = readCards();
  console.log('  cards:', cards.length);

  const nodes = [];
  const edges = [];

  for (const c of cards) {
    const node = toNode(c);
    if (!node.id) continue;
    nodes.push(node);
  }

  // Discover other ndjson sources under .opencode
  const opencodeDir = path.join(ROOT, '.opencode');
  const ndfiles = discoverNDJSON(opencodeDir);
  for (const f of ndfiles) {
    const recs = readNDJSON(f);
    for (const r of recs) {
      if (r.id && r.type === 'node') nodes.push(r);
      if (r.from && r.to) edges.push({ from: r.from, to: r.to, kind: r.kind || 'from_ndjson' });
      // try simple joins: ledger rows with sourceRefs
      if (r.sourceRefs && Array.isArray(r.sourceRefs)) {
        for (const sr of r.sourceRefs) {
          const matched = nodes.find(n => n.sourceRef && n.sourceRef.replace(/\\\\/g,'/') === sr.replace(/\\\\/g,'/'));
          if (matched) edges.push(toEdge(r.id || `${r.id||Math.random()}`, matched.id, 'mentions'));
        }
      }
    }
  }

  // dedupe nodes by id
  const dedupNodes = Object.values(nodes.reduce((acc,n)=>{ if(n.id) acc[n.id]=n; return acc; },{}));
  writeNDJSON(dedupNodes, path.join(OUT_DIR,'nodes.ndjson'));
  writeNDJSON(edges, path.join(OUT_DIR,'edges.ndjson'));

  console.log('  wrote nodes:', dedupNodes.length, 'edges:', edges.length);
}

main().catch(e=>{ console.error(e); process.exit(1); });
