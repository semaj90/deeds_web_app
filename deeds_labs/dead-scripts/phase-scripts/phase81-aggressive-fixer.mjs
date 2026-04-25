#!/usr/bin/env node
/**
 * Phase 81: Aggressive Syntax Fixer
 * Fixes remaining comma/semicolon corruption patterns
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

  // Pattern 1: ";," → ";" (semicolon followed by comma in type/interface)
  const beforeP1 = modified;
  modified = modified.replace(/;\s*,\s*/g, '; ');
  if (modified !== beforeP1) fixCount += (beforeP1.match(/;\s*,/g) || []).length;

  // Pattern 2: Duplicate param types "param: Type, Type: Type" → "param: Type"
  const beforeP2 = modified;
  modified = modified.replace(/,\s*(\w+):\s*\1\b/g, '');
  if (modified !== beforeP2) fixCount += (beforeP2.match(/,\s*(\w+):\s*\1\b/g) || []).length;

  // Pattern 3: "string: string" duplicate type annotation
  const beforeP3 = modified;
  modified = modified.replace(/,\s*string:\s*string\b/g, '');
  if (modified !== beforeP3) fixCount += (beforeP3.match(/,\s*string:\s*string\b/g) || []).length;

  // Pattern 4: Object property with trailing type "key: value: Type," → "key: value,"
  const beforeP4 = modified;
  modified = modified.replace(/(\w+):\s*(\w+(?:\.\w+)*):\s*(\w+),/g, '$1: $2,');
  if (modified !== beforeP4) fixCount += (beforeP4.match(/(\w+):\s*(\w+(?:\.\w+)*):\s*(\w+),/g) || []).length;

  // Pattern 5: Duplicate property names "key: value, value: value" → "key: value"
  const beforeP5 = modified;
  modified = modified.replace(/(\w+):\s*(\w+),\s*\2:\s*\2\b/g, '$1: $2');
  if (modified !== beforeP5) fixCount += (beforeP5.match(/(\w+):\s*(\w+),\s*\2:\s*\2\b/g) || []).length;

  // Pattern 6: Empty trailing type params ", )" → ")"
  const beforeP6 = modified;
  modified = modified.replace(/,\s*\)/g, ')');
  if (modified !== beforeP6) fixCount += (beforeP6.match(/,\s*\)/g) || []).length;

  // Pattern 7: Double colons in template literals "${ key: key }" → "${key}"
  const beforeP7 = modified;
  modified = modified.replace(/\$\{\s*(\w+):\s*\1\s*\}/g, '${$1}');
  if (modified !== beforeP7) fixCount += (beforeP7.match(/\$\{\s*(\w+):\s*\1\s*\}/g) || []).length;

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

console.log(`\n🔧 Phase 81: Aggressive Syntax Fixer${dryRun ? ' (DRY RUN)' : ''}`);
console.log('='.repeat(50));

let files = [];
if (fileArg) {
  files = [path.resolve(rootDir, fileArg.replace('--file=', ''))];
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
