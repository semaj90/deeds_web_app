#!/usr/bin/env node
/**
 * Quick Pattern-Based Fixes
 * Applies known fixes without waiting for full error scan
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const fixes = {
  runesOutsideSvelte: {
    pattern: /\$state\(/g,
    test: (content, file) => !file.endsWith('.svelte') && !file.endsWith('.svelte.ts') && content.includes('$state('),
    fix: (content) => {
      console.log('  ⚠️  Removing $state from non-Svelte file');
      // Replace $state with regular assignments
      return content
        .replace(/let\s+(\w+)\s*=\s*\$state\((.*?)\);/g, 'let $1 = $2;')
        .replace(/const\s+(\w+)\s*=\s*\$state\((.*?)\);/g, 'const $1 = $2;');
    }
  },
  
  eventHandlers: {
    pattern: /on:(\w+)=/g,
    test: (content) => content.match(/on:(\w+)=/),
    fix: (content) => {
      console.log('  🔧 Updating event handlers on: → on');
      return content.replace(/on:(\w+)=/g, 'on$1=');
    }
  },
  
  doubleQuotes: {
    pattern: /''/g,
    test: (content) => content.includes("''") && content.match(/from\s+['"]/),
    fix: (content) => {
      console.log('  🔧 Fixing double quotes in imports');
      return content.replace(/from\s+''/g, "from '");
    }
  },
  
  exportLet: {
    pattern: /export\s+let\s+/g,
    test: (content, file) => file.endsWith('.svelte') && content.includes('export let'),
    fix: (content) => {
      console.log('  🔧 Checking export let → $props migration');
      // Only log, don't auto-fix as it needs context
      return content;
    }
  }
};

async function fixFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let modified = content;
  let changed = false;
  
  for (const [name, { test, fix }] of Object.entries(fixes)) {
    if (test(modified, filePath)) {
      const before = modified;
      modified = fix(modified);
      if (modified !== before) {
        changed = true;
      }
    }
  }
  
  if (changed) {
    fs.writeFileSync(filePath, modified);
    return true;
  }
  return false;
}

async function main() {
  console.log('🚀 Quick Pattern Fix\n');
  
  // Find all Svelte and TS files
  const svelteFiles = await glob('src/**/*.svelte', { cwd: ROOT });
  const tsFiles = await glob('src/**/*.ts', { cwd: ROOT });
  const allFiles = [...svelteFiles, ...tsFiles];
  
  console.log(`📁 Found ${allFiles.length} files\n`);
  
  let fixed = 0;
  for (const file of allFiles) {
    const filePath = path.join(ROOT, file);
    try {
      if (await fixFile(filePath)) {
        console.log(`✅ ${file}`);
        fixed++;
      }
    } catch (err) {
      console.error(`❌ ${file}: ${err.message}`);
    }
  }
  
  console.log(`\n✨ Fixed ${fixed}/${allFiles.length} files`);
}

main().catch(console.error);
