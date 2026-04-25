#!/usr/bin/env node
/**
 * Phase 80 Union Type Fixer
 * Specifically fixes `: Type: null` -> `: Type | null` patterns
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stats = {
  filesProcessed: 0,
  filesModified: 0,
  fixes: 0,
};

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
  } catch (e) {
    // Skip directories we can't read
  }
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

  // Pattern 1: Function return type with union - ): Type: null { or ): Type: undefined {
  const returnTypePattern = /\):\s*([A-Za-z_][\w<>\[\],.'\s]*?):\s*(null|undefined)\s*\{/g;
  modified = modified.replace(returnTypePattern, (match, type, nullType) => {
    fixCount++;
    return `): ${type.trim()} | ${nullType} {`;
  });

  // Pattern 2: Property type union at end of line or before =
  // model: string: null;  ->  model: string | null;
  const propertyPattern = /^(\s*)(\w+):\s*([A-Za-z_][\w<>\[\],.'\s]*?):\s*(null|undefined)\s*(;|=)/gm;
  modified = modified.replace(propertyPattern, (match, indent, name, type, nullType, end) => {
    fixCount++;
    return `${indent}${name}: ${type.trim()} | ${nullType}${end}`;
  });

  // Pattern 3: Arrow function return union - => Type: undefined;
  const arrowPattern = /=>\s*([A-Za-z_][\w<>\[\],.'\s]*?):\s*(null|undefined)\s*;/g;
  modified = modified.replace(arrowPattern, (match, type, nullType) => {
    fixCount++;
    return `=> ${type.trim()} | ${nullType};`;
  });

  // Pattern 4: Buffer | string | Uint8Array | ArrayBuffer: undefined (complex union)
  const complexUnionPattern = /(\|\s*[A-Za-z_]\w*):\s*(undefined|null)\s*\)/g;
  modified = modified.replace(complexUnionPattern, (match, last, nullType) => {
    fixCount++;
    return `${last} | ${nullType})`;
  });

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

console.log(`\n🔧 Phase 80: Union Type Fixer${dryRun ? ' (DRY RUN)' : ''}`);
console.log('='.repeat(50));

let files = [];
if (fileArg) {
  files = [path.resolve(rootDir, fileArg.replace('--file=', ''))];
} else if (dirArg) {
  const targetDir = path.resolve(rootDir, dirArg.replace('--dir=', ''));
  files = findFiles(targetDir);
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
