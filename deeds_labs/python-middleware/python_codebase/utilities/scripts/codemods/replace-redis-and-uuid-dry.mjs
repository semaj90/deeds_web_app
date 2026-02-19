#!/usr/bin/env node
/*
  Dry-run Codemod: replace-redis-and-uuid-dry.mjs
  - Scans for `new Redis(`, `new IORedis(` and `z.string().uuid()` occurrences and reports files + snippets.
  - Non-destructive: does not modify any files.
  Usage: node scripts/codemods/replace-redis-and-uuid-dry.mjs <path...>
*/

import fs from 'fs';
import path from 'path';

function walk(dir, cb) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entr of entries) {
    const full = path.join(dir, entr.name);
    if (entr.isDirectory()) {
      if (entr.name === 'node_modules' || entr.name === '.git') continue;
      walk(full, cb);
    } else {
      cb(full);
    }
  }
}

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error('Usage: node replace-redis-and-uuid-dry.mjs <path> [<path> ...]');
  process.exit(1);
}

const tsRx = /new\s+IORedis\s*\(|new\s+Redis\s*\(|z\.string\(\)\.uuid\(\)/g;
let total = 0;
const results = [];

for (const root of roots) {
  walk(root, file => {
    if (!file.endsWith('.ts') && !file.endsWith('.js') && !file.endsWith('.svelte')) return;
    let src = fs.readFileSync(file, 'utf8');
    let match;
    const lines = src.split(/\r?\n/);
    while ((match = tsRx.exec(src)) !== null) {
      total++;
      // find line number
      const idx = match.index;
      let charCount = 0;
      let lineNumber = 0;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i] + '\n';
        if (charCount + l.length > idx) {
          lineNumber = i + 1;
          break;
        }
        charCount += l.length;
      }
      // snippet: show 2 lines before and after
      const start = Math.max(0, lineNumber - 3);
      const end = Math.min(lines.length, lineNumber + 2);
      const snippet = lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join('\n');
      results.push({ file, line: lineNumber, match: match[0], snippet });
    }
  });
}

if (results.length === 0) {
  console.log('Dry-run: no matches found.');
  process.exit(0);
}

console.log(`Dry-run found ${results.length} potential replacements across ${[...new Set(results.map(r=>r.file))].length} files.\n`);

const filesSeen = new Set();
for (const r of results) {
  if (!filesSeen.has(r.file)) {
    console.log('---');
    console.log(r.file);
    filesSeen.add(r.file);
  }
  console.log(`
Match at line ${r.line}: ${r.match}\n`);
  console.log(r.snippet);
}

console.log('\nSummary:');
console.log(`  Matches: ${results.length}`);
console.log(`  Files: ${filesSeen.size}`);
console.log('\nRecommendation: Review the listed files. If the changes look safe, run the real codemod (scripts/codemods/replace-redis-and-uuid.mjs) to apply changes with .bak backups.');
