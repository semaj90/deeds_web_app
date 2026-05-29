#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(new URL(import.meta.url).pathname, '../..');
const INPUT = path.join(process.cwd(), '.tmp', 'ast-unresolved-imports.jsonl');
const OUT = path.join(process.cwd(), '.tmp', 'top-unresolved-lib.csv');
if (!fs.existsSync(INPUT)) { console.error('missing', INPUT); process.exit(1); }
const lines = fs.readFileSync(INPUT,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l));
const counts = {};
const samples = {};
for (const r of lines) {
  const spec = r.spec || '';
  if (!spec.startsWith('$lib') && !spec.startsWith('@/lib') && !spec.includes('$lib/')) continue;
  counts[spec] = (counts[spec]||0)+1;
  if (!samples[spec]) samples[spec]=r.from;
}
const rows = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,200);
const hdr = 'spec,count,sample_from\n';
const body = rows.map(([spec,c])=>`"${spec.replace(/"/g,'""')}",${c},"${(samples[spec]||'').replace(/"/g,'""')}"`).join('\n');
fs.writeFileSync(OUT, hdr+body+'\n','utf8');
console.log('[top-unresolved-lib] wrote', OUT, 'rows=', rows.length);
