#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';

const PREFIX = 'c:\\Users\\james\\Videos\\deeds-web-app\\sveltekit-frontend\\';

// Parse sc-full-files.txt: "  586 c:\...\file.ts" → { path: "src/...", errors: 586 }
const scLines = readFileSync('sc-full-files.txt', 'utf8').trim().split('\n');
const errorFiles = scLines.map(line => {
  const match = line.trim().match(/^\s*(\d+)\s+(.+)$/);
  if (!match) return null;
  let path = match[2].trim();
  if (path.startsWith(PREFIX)) path = path.slice(PREFIX.length);
  path = path.split('\\').join('/');
  return { path, errors: parseInt(match[1], 10) };
}).filter(Boolean);

// Load category files (paths use backslash, normalize to forward slash)
function loadCategory(file) {
  if (!existsSync(file)) return new Set();
  return new Set(
    readFileSync(file, 'utf8').trim().split('\n')
      .map(l => l.trim().split('\\').join('/'))
      .filter(l => l.length > 0)
  );
}

const corrupted = loadCategory('unreachable-corrupted.txt');
const stub = loadCategory('unreachable-stub.txt');
const clean = loadCategory('unreachable-clean.txt');
const archive = loadCategory('unreachable-archive.txt');
const test = loadCategory('unreachable-test.txt');
const minified = loadCategory('unreachable-minified.txt');
const commented = loadCategory('unreachable-commented.txt');
const reachable = loadCategory('reachable.txt');

function categorize(path) {
  if (reachable.has(path)) return 'REACHABLE';
  if (corrupted.has(path)) return 'CORRUPTED';
  if (stub.has(path)) return 'STUB';
  if (clean.has(path)) return 'CLEAN';
  if (archive.has(path)) return 'ARCHIVE';
  if (test.has(path)) return 'TEST';
  if (minified.has(path)) return 'MINIFIED';
  if (commented.has(path)) return 'COMMENTED';
  return 'UNCATEGORIZED';
}

// Cross-reference
const byCat = {};
let totalErrors = 0;

for (const f of errorFiles) {
  const cat = categorize(f.path);
  if (!byCat[cat]) byCat[cat] = { files: 0, errors: 0, topFiles: [] };
  byCat[cat].files++;
  byCat[cat].errors += f.errors;
  byCat[cat].topFiles.push({ path: f.path, errors: f.errors });
  totalErrors += f.errors;
}

console.log(`\n=== svelte-check ERROR FILES (${errorFiles.length}) × REACHABILITY CATEGORIES ===\n`);
console.log(`${'Category'.padEnd(16)} ${'Files'.padStart(6)} ${'Errors'.padStart(8)} ${'% Errors'.padStart(9)}`);
console.log('─'.repeat(45));

for (const [cat, data] of Object.entries(byCat).sort((a, b) => b[1].errors - a[1].errors)) {
  const pct = ((data.errors / totalErrors) * 100).toFixed(1);
  console.log(`${cat.padEnd(16)} ${String(data.files).padStart(6)} ${String(data.errors).padStart(8)} ${(pct + '%').padStart(9)}`);
}
console.log('─'.repeat(45));
console.log(`${'TOTAL'.padEnd(16)} ${String(errorFiles.length).padStart(6)} ${String(totalErrors).padStart(8)} ${'100.0%'.padStart(9)}`);

// Top error files per category
for (const [cat, data] of Object.entries(byCat).sort((a, b) => b[1].errors - a[1].errors)) {
  console.log(`\n── ${cat} (${data.files} files, ${data.errors} errors) ──`);
  data.topFiles.sort((a, b) => b.errors - a.errors);
  for (const f of data.topFiles.slice(0, 5)) {
    console.log(`  ${String(f.errors).padStart(5)}  ${f.path}`);
  }
  if (data.topFiles.length > 5) console.log(`  ... and ${data.topFiles.length - 5} more`);
}
