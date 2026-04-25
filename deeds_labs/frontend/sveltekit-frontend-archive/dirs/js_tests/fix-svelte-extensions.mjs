#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

console.log('🔧 Fixing incorrect .js extensions on Svelte components...');

// Get all TypeScript and Svelte files
const files = glob.sync('src/**/*.{ts,svelte}');

let fixedFiles = 0;
let totalFixes = 0;

for (const file of files) {
  try {
    const content = readFileSync(file, 'utf8');
    let newContent = content;
    let fileFixes = 0;

    // Fix .js extensions that were incorrectly added to Svelte components
    const svelteFix = newContent.replace(/from ['"]([^'"]*\.svelte)\.js['"];?/g, "from '$1';");
    if (svelteFix !== newContent) {
      newContent = svelteFix;
      fileFixes++;
    }

    if (newContent !== content) {
      writeFileSync(file, newContent, 'utf8');
      fixedFiles++;
      totalFixes += fileFixes;
      console.log(`✅ Fixed ${fileFixes} Svelte imports in ${file}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${file}:`, error.message);
  }
}

console.log(`\n🎉 Fixed Svelte imports in ${fixedFiles} files (${totalFixes} total fixes)`);
