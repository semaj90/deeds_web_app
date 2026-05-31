#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const cwd = process.cwd();
const p = path.join(cwd, '.tmp', 'ingest', 'parent-atlas-hypergraph.jsonl');
console.log('PATH', p);
if (!fs.existsSync(p)){
  console.log('MISSING');
  process.exit(0);
}
const cnt = fs.readFileSync(p,'utf8').split(/\r?\n/).filter(Boolean).length;
console.log('LINES', cnt);
process.exit(0);
