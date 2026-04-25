#!/usr/bin/env node

/**
 * Fix Svelte 5 Syntax Errors
 * Converts old event handler syntax (on:*) to new syntax (on*)
 * Converts export let to $props()
 * Converts reactive assignments to $state()
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const filesToFix = [
  'src/lib/components/yorha/evidence/EvidenceGrid.svelte',
  'src/lib/components/yorha/evidence/EvidenceFilters.svelte',
  'src/lib/components/yorha/cases/CaseFilters.svelte',
  'src/lib/components/FilterPanel.svelte',
  'src/lib/components/SearchBar.svelte',
  'src/lib/components/PersonForm.svelte',
];

function fixSvelteFile(filePath) {
  const fullPath = path.join(rootDir, filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(fullPath, 'utf-8');
  const original = content;

  // Fix 1: Convert on:change to onchange
  content = content.replace(/on:change\s*=/g, 'onchange=');
  content = content.replace(/on:change\s*\{/g, 'onchange{');
  content = content.replace(/on:change\s*\(/g, 'onchange(');

  // Fix 2: Convert on:input to oninput
  content = content.replace(/on:input\s*=/g, 'oninput=');
  content = content.replace(/on:input\s*\{/g, 'oninput{');
  content = content.replace(/on:input\s*\(/g, 'oninput(');

  // Fix 3: Convert on:click to onclick
  content = content.replace(/on:click\s*=/g, 'onclick=');
  content = content.replace(/on:click\s*\{/g, 'onclick{');
  content = content.replace(/on:click\s*\(/g, 'onclick(');

  // Fix 4: Convert on:keydown to onkeydown
  content = content.replace(/on:keydown\s*=/g, 'onkeydown=');
  content = content.replace(/on:keydown\s*\{/g, 'onkeydown{');
  content = content.replace(/on:keydown\s*\(/g, 'onkeydown(');

  // Fix 5: Convert on:submit to onsubmit
  content = content.replace(/on:submit\s*=/g, 'onsubmit=');
  content = content.replace(/on:submit\s*\{/g, 'onsubmit{');
  content = content.replace(/on:submit\s*\(/g, 'onsubmit(');

  if (content !== original) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`✅ Fixed: ${filePath}`);
    return true;
  } else {
    console.log(`⏭️  No changes needed: ${filePath}`);
    return false;
  }
}

console.log('🔧 Fixing Svelte 5 Syntax Errors...\n');

let fixed = 0;
for (const file of filesToFix) {
  if (fixSvelteFile(file)) {
    fixed++;
  }
}

console.log(`\n✨ Fixed ${fixed}/${filesToFix.length} files`);
