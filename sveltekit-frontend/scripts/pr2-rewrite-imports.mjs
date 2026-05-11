#!/usr/bin/env node
// PR-2: Rewrite import paths after lib/services → lib/server/services move.
// Usage: node scripts/pr2-rewrite-imports.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'src');

const MOVES = [
  ['$lib/services/couchdb-client',        '$lib/server/services/couchdb-client'],
  ['$lib/services/qdrant-client',         '$lib/server/services/qdrant-client'],
  ['$lib/services/report-auto-populator', '$lib/server/services/report-auto-populator'],
  ['$lib/services/error-analysis',        '$lib/server/services/error-analysis'],
  ['$lib/services/knowledge-search',      '$lib/server/services/knowledge-search'],
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(ts|svelte|js|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let totalFiles = 0;
let totalReplacements = 0;
const touched = [];

for (const file of walk(ROOT)) {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;
  for (const [from, to] of MOVES) {
    // Match the path followed by `/`, quote/backtick (end of import path).
    // Path can be followed by: `/` (subdir), `.` (file ext), or quote/backtick (string end).
    const re = new RegExp(escapeRegex(from) + `(?=[/.'"\`])`, 'g');
    const matches = content.match(re);
    if (matches) {
      totalReplacements += matches.length;
      content = content.replace(re, to);
    }
  }
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    totalFiles++;
    touched.push(path.relative(process.cwd(), file));
  }
}

console.log('Files touched:', totalFiles);
console.log('Total replacements:', totalReplacements);
console.log('---');
for (const f of touched) console.log(f);