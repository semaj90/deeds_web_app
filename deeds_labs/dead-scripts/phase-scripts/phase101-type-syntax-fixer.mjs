#!/usr/bin/env node

/**
 * Phase 101: TypeScript Interface/Type Syntax Fixer
 *
 * Fixes semicolons in type definitions that should be commas:
 * - Interface method signatures
 * - Function parameter types
 * - Type object properties
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');

let stats = {
  filesProcessed: 0,
  interfaceSemicolonsFixed: 0,
  parameterSemicolonsFixed: 0,
  totalFixes: 0,
  errors: []
};

async function getAllFiles(dir, extensions = ['.ts', '.svelte']) {
  const files = [];

  async function traverse(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!['node_modules', '.svelte-kit', 'build', 'dist'].includes(entry.name)) {
          await traverse(fullPath);
        }
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }

  await traverse(dir);
  return files;
}

function fixTypeSyntax(content) {
  let modified = content;
  let fixCount = 0;

  // Pattern 1: Interface/type method signatures with semicolon before parameter
  // Example: method(param: Type; param2: Type) => method(param: Type, param2: Type)
  const methodParamPattern = /(\w+:\s*[^;)]+);(\s*\w+\??:\s*[^;)]+\))/g;
  const methodMatches = [...content.matchAll(methodParamPattern)];

  for (const match of methodMatches) {
    const [fullMatch, before, after] = match;
    const fixed = `${before},${after}`;
    modified = modified.replace(fullMatch, fixed);
    fixCount++;
  }

  // Pattern 2: Function parameter types with semicolon
  // Example: (key: string; layer?: string) => (key: string, layer?: string)
  const functionParamPattern = /\(([^()]*);([^()]*)\)/g;
  let prevModified = '';

  // Multiple passes to handle nested cases
  while (prevModified !== modified) {
    prevModified = modified;
    modified = modified.replace(functionParamPattern, (match, before, after) => {
      // Only replace if this looks like parameters (contains : for type annotations)
      if (before.includes(':') && after.includes(':')) {
        fixCount++;
        return `(${before},${after})`;
      }
      return match;
    });
  }

  // Pattern 3: Object/interface properties with trailing semicolon before closing brace
  // Example: { prop: type; } => { prop: type }
  const trailingSemiPattern = /(\w+\??:\s*[^;{}]+);(\s*[})])/g;
  modified = modified.replace(trailingSemiPattern, (match, prop, closing) => {
    // Make sure this is inside a type/interface context
    fixCount++;
    return `${prop}${closing}`;
  });

  return { content: modified, fixCount };
}

async function processFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    const original = content;

    const { content: fixed, fixCount } = fixTypeSyntax(content);

    if (fixCount > 0 && fixed !== original) {
      await fs.writeFile(filePath, fixed, 'utf-8');
      stats.filesProcessed++;
      stats.totalFixes += fixCount;

      const relativePath = path.relative(ROOT_DIR, filePath);
      console.log(`✅ Fixed ${fixCount} issues: ${relativePath}`);
    }

  } catch (error) {
    stats.errors.push({ file: filePath, error: error.message });
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('🔧 Phase 101: TypeScript Syntax Fixer\n');
  console.log(`📁 Target: ${SRC_DIR}\n`);

  const files = await getAllFiles(SRC_DIR);
  console.log(`📊 Found ${files.length} files\n`);

  for (const file of files) {
    await processFile(file);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📈 Fix Summary');
  console.log('='.repeat(60));
  console.log(`Files processed: ${stats.filesProcessed}`);
  console.log(`Total fixes: ${stats.totalFixes}`);

  if (stats.errors.length > 0) {
    console.log(`\n⚠️  Errors: ${stats.errors.length}`);
    stats.errors.forEach(e => console.log(`  - ${e.file}: ${e.error}`));
  }

  console.log('\n✅ Syntax fixes complete!');
  console.log('\n📋 Next: Run npx svelte-check to verify');
}

main().catch(console.error);
