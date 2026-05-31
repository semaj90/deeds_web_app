#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const PARENT = path.join(ROOT, '.tmp', 'ingest', 'parent-atlas-hypergraph.jsonl');
const OUT = path.join(ROOT, '.tmp', 'ingest', 'parent-atlas-hypergraph.with-clusters.jsonl');
const GRAPH = path.join(ROOT, 'docs', 'graph', 'codebase-graph.json');

if (!fs.existsSync(PARENT)) {
  console.error('parent atlas not found:', PARENT);
  process.exit(1);
}
const g = fs.existsSync(GRAPH) ? JSON.parse(fs.readFileSync(GRAPH,'utf8')) : { files: [] };

// Build dir -> top cluster mapping (same logic as seed script)
const dirHits = {};
for (const f of g.files ?? []) {
  if (!f.rel || f.clusterId === undefined || f.clusterId < 0) continue;
  const dir = f.rel.includes('/') ? f.rel.split('/').slice(0,-1).join('/') : '.';
  const slot = dirHits[dir] ??= { counts: {}, somRow: null, somCol: null };
  slot.counts[f.clusterId] = (slot.counts[f.clusterId] ?? 0) + 1;
  if (slot.somRow === null && f.somBmuRow !== undefined) {
    slot.somRow = f.somBmuRow;
    slot.somCol = f.somBmuCol;
  }
}
const dirMeta = new Map();
for (const [dir, slot] of Object.entries(dirHits)) {
  const top = Object.entries(slot.counts).sort((a,b)=>b[1]-a[1])[0];
  dirMeta.set(dir.toLowerCase(), { clusterId: parseInt(top[0],10), somRow: slot.somRow, somCol: slot.somCol });
}

const inp = fs.readFileSync(PARENT,'utf8').split(/\r?\n/).filter(Boolean);
let updated = 0, total = 0;
const outStream = fs.createWriteStream(OUT, { flags: 'w' });
for (const line of inp) {
  total++;
  let obj;
  try { obj = JSON.parse(line); } catch (e) { outStream.write(line+'\n'); continue; }

  // derive a path for lookup: prefer obj.path, obj.source_ref, obj.file
  const raw = obj.path ?? obj.source_ref ?? obj.file ?? obj.source ?? null;
  if (raw) {
    const p = String(raw).replace(/^file:\/\//,'').replace(/^\./,'').replace(/\\/g,'/');
    const dir = p.includes('/') ? p.split('/').slice(0,-1).join('/') : '.';
    const meta = dirMeta.get(dir.toLowerCase()) ?? null;
    if (meta && (obj.clusterId === undefined || obj.clusterId === null || obj.clusterId < 0)) {
      obj.clusterId = meta.clusterId;
      if (meta.somRow !== null) obj.somBmuRow = meta.somRow;
      if (meta.somCol !== null) obj.somBmuCol = meta.somCol;
      updated++;
    }
  }

  outStream.write(JSON.stringify(obj) + '\n');
}
outStream.on('finish', () => {
  console.log(`Wrote ${OUT}`);
  console.log(`Total ${total} lines; updated ${updated} records with clusterId`);
  process.exit(0);
});
outStream.end();
