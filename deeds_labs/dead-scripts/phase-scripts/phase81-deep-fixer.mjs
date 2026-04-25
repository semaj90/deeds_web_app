#!/usr/bin/env node
/**
 * Phase 81: Deep Corruption Fixer
 * Fixes complex multi-layered corruption patterns
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stats = { filesProcessed: 0, filesModified: 0, fixes: 0 };

function findFiles(dir, extensions = ['.ts', '.tsx']) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.svelte-kit', 'dist', '.git', 'build'].includes(entry.name)) {
          results.push(...findFiles(fullPath, extensions));
        }
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  } catch (e) { }
  return results;
}

function fixFile(filePath, dryRun = false) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return { fixes: 0, modified: false };
  }

  let modified = content;
  let fixCount = 0;

  // Pattern 1: "prop: obj.prop: nextProp:" → "prop: obj.prop, nextProp:"
  const beforeP1 = modified;
  modified = modified.replace(/(\w+):\s*(\w+\.\w+):\s*(\w+):/g, '$1: $2, $3:');
  if (modified !== beforeP1) fixCount++;

  // Pattern 2: "??: null:" → "?? null,"
  const beforeP2 = modified;
  modified = modified.replace(/\?\?:\s*(null|undefined):/g, '?? $1,');
  if (modified !== beforeP2) fixCount++;

  // Pattern 3: "??, null:" → "?? null,"
  const beforeP3 = modified;
  modified = modified.replace(/\?\?,\s*(null|undefined):/g, '?? $1,');
  if (modified !== beforeP3) fixCount++;

  // Pattern 4: " null: prop," → ", prop," (null as prop name)
  const beforeP4 = modified;
  modified = modified.replace(/\s+null:\s*(\w+),/g, ', $1,');
  if (modified !== beforeP4) fixCount++;

  // Pattern 5: "String(value): nextProp:" → "String(value), nextProp:"
  const beforeP5 = modified;
  modified = modified.replace(/(\w+\([^)]*\)):\s*(\w+):/g, '$1, $2:');
  if (modified !== beforeP5) fixCount++;

  // Pattern 6: "ISO: string" in comments/values → remove corruption
  const beforeP6 = modified;
  modified = modified.replace(/ISO:\s*string/g, 'ISO string');
  if (modified !== beforeP6) fixCount++;

  // Pattern 7: Multiple colons in object prop: "a: b: c: d," → "a: d,"
  let iterations = 0;
  while (iterations < 10) {
    const beforeIter = modified;
    modified = modified.replace(/(\w+):\s*\w+:\s*(\w+(?:\.\w+)*)/g, '$1: $2');
    if (modified === beforeIter) break;
    fixCount++;
    iterations++;
  }

  // Pattern 8: "var ??: null" → "var ?? null"
  const beforeP8 = modified;
  modified = modified.replace(/(\w+)\s*\?\?:\s*(null|undefined)/g, '$1 ?? $2');
  if (modified !== beforeP8) fixCount++;

  if (fixCount > 0 && !dryRun) {
    fs.writeFileSync(filePath, modified, 'utf8');
  }

  return { fixes: fixCount, modified: fixCount > 0 };
}

// Main
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dirArg = args.find(a => a.startsWith('--dir='));
const fileArg = args.find(a => a.startsWith('--file='));
const rootDir = path.resolve(__dirname, '..');

console.log(`\n🔧 Phase 81: Deep Corruption Fixer${dryRun ? ' (DRY RUN)' : ''}`);
console.log('='.repeat(50));

let files = [];
if (fileArg) {
  const p = fileArg.replace('--file=', '');
  const abs = path.isAbsolute(p) ? p : path.resolve(rootDir, p);
  if (fs.existsSync(abs)) files = [abs];
  else console.warn(`⚠️ File not found: ${abs}`);
} else if (dirArg) {
  files = findFiles(path.resolve(rootDir, dirArg.replace('--dir=', '')));
} else {
  files = findFiles(path.join(rootDir, 'src'));
}

console.log(`\n📁 Found ${files.length} files to process\n`);

for (const file of files) {
  stats.filesProcessed++;
  const relPath = path.relative(rootDir, file);
  const result = fixFile(file, dryRun);

  if (result.fixes > 0) {
    console.log(`  ✅ ${relPath}: ${result.fixes} fixes`);
    stats.filesModified++;
    stats.fixes += result.fixes;
  }
}

console.log('\n' + '='.repeat(50));
console.log('📊 Summary');
console.log('='.repeat(50));
console.log(`Files processed: ${stats.filesProcessed}`);
console.log(`Files modified: ${stats.filesModified}`);
console.log(`Total fixes: ${stats.fixes}`);
console.log(`\n✅ Complete!${dryRun ? ' (no changes written)' : ''}`);
