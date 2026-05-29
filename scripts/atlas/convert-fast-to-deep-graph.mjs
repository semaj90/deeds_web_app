#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const SRC = path.join(root, 'sveltekit-frontend', 'docs', 'graph', 'codebase-graph.json');
const OUT_DIR = path.join(root, 'memory', 'graphify', 'deep');
const OUT = path.join(OUT_DIR, 'deep-import-graph.json');

if (!fs.existsSync(SRC)) {
  console.error('[convert-fast-to-deep] source not found:', SRC);
  process.exit(1);
}

const g = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const files = Array.isArray(g.files) ? g.files : [];

const nodes = files.map((f) => ({
  path: f.rel || f.file || f.id || '',
  rel: f.rel || '',
  ext: f.ext || '',
  tags: f.tags || [],
  summary: f.summary || '',
  lineCount: f.lineCount || 0
})).filter(n => n.path && n.path.length);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ nodes }, null, 2), 'utf8');

console.log('[convert-fast-to-deep] wrote', OUT, 'nodes:', nodes.length);
