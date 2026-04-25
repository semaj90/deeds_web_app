#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '../sveltekit-frontend/src');
let stats = {
  filesProcessed: 0,
  filesFixed: 0,
  issuesFixed: 0
};

function fixTypeScriptCorruption(content) {
  let fixed = content;
  let count = 0;

  // Fix stray commas after type declarations
  // type;, → type;
  if (/:\s*[a-zA-Z<>[\]|&]+;,/.test(fixed)) {
    const before = fixed;
    fixed = fixed.replace(/(:[\s\w<>[\]|&]+);,/g, '$1;');
    if (fixed !== before) count++;
  }

  // Fix stray commas in type interface definitions
  // { status: number;, error: ... }
  fixed = fixed.replace(/([a-z]+:\s*[a-zA-Z<>[\]|&]+);,(\s*[a-z])/g, (match, typeDecl, nextProp) => {
    count++;
    return `${typeDecl};${nextProp}`;
  });

  // Fix duplicated commas
  fixed = fixed.replace(/,,+/g, ',');
  if (fixed !== content && !/,,+/.test(content)) count++;

  // Fix incomplete type unions
  // | undefined;, → | undefined;
  fixed = fixed.replace(/(\|\s*undefined);,/g, '$1;');
  if (fixed !== content && /\|\s*undefined;,/.test(content)) count++;

  return { fixed, count };
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    stats.filesProcessed++;

    const result = fixTypeScriptCorruption(content);

    if (result.count > 0) {
      fs.writeFileSync(filePath, result.fixed, 'utf-8');
      stats.filesFixed++;
      stats.issuesFixed += result.count;
      const relPath = path.relative(srcDir, filePath);
      console.log(`✅ Fixed: ${relPath} (${result.count} issues)`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.svelte') || file.endsWith('.ts') || file.endsWith('.tsx')) {
      processFile(filePath);
    }
  }
}

console.log('🚀 Phase 44H: TypeScript Type Declaration Fixer');
console.log('='.repeat(60));

walkDir(srcDir);

console.log('\n' + '='.repeat(60));
console.log('✅ Phase 44H Complete!');
console.log(`Files processed: ${stats.filesProcessed}`);
console.log(`Files fixed: ${stats.filesFixed}`);
console.log(`Issues fixed: ${stats.issuesFixed}`);
