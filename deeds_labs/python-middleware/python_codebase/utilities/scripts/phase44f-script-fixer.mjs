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

function fixScriptCorruption(content) {
  let fixed = content;
  let count = 0;

  // Fix <script$1>, <script$N>, etc.
  if (/<script\$\d+/.test(fixed)) {
    const before = fixed;
    fixed = fixed.replace(/<script\$\d+/, '<script lang="ts"');
    if (fixed !== before) count++;
  }

  // Fix </script$1>, etc.
  if (/<\/script\$\d+/.test(fixed)) {
    const before = fixed;
    fixed = fixed.replace(/<\/script\$\d+/, '</script');
    if (fixed !== before) count++;
  }

  // Fix duplicated <script> tags
  if (/<script\s+[^>]*><script/.test(fixed)) {
    const before = fixed;
    fixed = fixed.replace(/<script([^>]*)>\s*<script([^>]*)>/g, '<script$1$2>');
    if (fixed !== before) count++;
  }

  return { fixed, count };
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    stats.filesProcessed++;

    const result = fixScriptCorruption(content);

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
    } else if (file.endsWith('.svelte')) {
      processFile(filePath);
    }
  }
}

console.log('🚀 Phase 44F: Script Tag Corruption Fixer');
console.log('='.repeat(60));

walkDir(srcDir);

console.log('\n' + '='.repeat(60));
console.log('✅ Phase 44F Complete!');
console.log(`Files processed: ${stats.filesProcessed}`);
console.log(`Files fixed: ${stats.filesFixed}`);
console.log(`Issues fixed: ${stats.issuesFixed}`);
