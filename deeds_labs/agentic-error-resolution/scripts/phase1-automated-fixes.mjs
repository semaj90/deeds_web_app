#!/usr/bin/env node
/**
 * Phase 1: Automated Error Fixes
 * Targets: ~2K errors (simple syntax patterns)
 * - Remove duplicate quotes
 * - Fix $state placement
 * - Normalize Dialog/Card casing
 * - Remove legacy $: statements
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const LOG_DIR = path.join(ROOT, 'agentic-error-resolution/logs');
const ERROR_DIR = path.join(ROOT, 'agentic-error-resolution/errors');

const logFile = path.join(LOG_DIR, `phase1-${Date.now()}.log`);

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
  console.log(msg);
}

// Pattern 1: Remove duplicate trailing quotes in imports
function fixDuplicateQuotes(content) {
  return content.replace(/from\s+['"]([^'"]+)['"]['"];/g, "from '$1';");
}

// Pattern 2: Fix invalid $state placement (in callbacks/try-finally)
function fix$statePlacement(content) {
  // Replace $state(false) assignments with simple assignments
  return content
    .replace(/(\w+)\s*=\s*\$state\(false\);/g, '$1 = false;')
    .replace(/(\w+)\s*=\s*\$state\(true\);/g, '$1 = true;')
    .replace(/(\w+)\s*=\s*\$state\(null\);/g, '$1 = null;')
    .replace(/(\w+)\s*=\s*\$state\(undefined\);/g, '$1 = undefined;')
    .replace(/(\w+)\s*=\s*\$state\(\[\]\);/g, '$1 = [];');
}

// Pattern 3: Remove legacy reactive statements
function removeLegacyReactive(content) {
  // Replace $: with $effect or remove if simple
  return content.replace(/^\s*\$:\s*(\w+)\s*=\s*(.+);/gm, (match, varName, expr) => {
    // Simple assignments can just be removed or converted to $derived
    return `  let ${varName} = $derived(${expr});`;
  });
}

// Pattern 4: Normalize component casing
function normalizeComponentCasing(content) {
  const fixes = {
    'dialog.svelte': 'Dialog.svelte',
    'card.svelte': 'Card.svelte',
    'button.svelte': 'Button.svelte',
    'input.svelte': 'Input.svelte',
  };
  
  let result = content;
  for (const [wrong, correct] of Object.entries(fixes)) {
    result = result.replace(new RegExp(wrong, 'g'), correct);
  }
  return result;
}

async function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    const original = content;
    
    content = fixDuplicateQuotes(content);
    content = fix$statePlacement(content);
    content = removeLegacyReactive(content);
    content = normalizeComponentCasing(content);
    
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      modified = true;
    }
    
    return modified;
  } catch (err) {
    log(`❌ Error processing ${filePath}: ${err.message}`);
    return false;
  }
}

async function findSvelteFiles(dir) {
  const files = [];
  
  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules, .svelte-kit, etc.
        if (!['node_modules', '.svelte-kit', 'build', 'dist', '.git'].includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.svelte')) {
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}

async function main() {
  log('🚀 Phase 1: Automated Error Fixes');
  log(`📁 Root: ${ROOT}`);
  
  const srcDir = path.join(ROOT, 'src');
  const files = await findSvelteFiles(srcDir);
  
  log(`📊 Found ${files.length} Svelte files`);
  
  let fixedCount = 0;
  
  for (const file of files) {
    const modified = await processFile(file);
    if (modified) {
      fixedCount++;
      log(`✅ Fixed: ${path.relative(ROOT, file)}`);
    }
  }
  
  log(`\n✨ Phase 1 Complete: ${fixedCount}/${files.length} files modified`);
  log(`📝 Log: ${logFile}`);
  
  // Save summary
  const summary = {
    phase: 1,
    timestamp: new Date().toISOString(),
    totalFiles: files.length,
    modifiedFiles: fixedCount,
    estimatedErrorsFixed: fixedCount * 3 // Rough estimate
  };
  
  fs.writeFileSync(
    path.join(ERROR_DIR, 'phase1-summary.json'),
    JSON.stringify(summary, null, 2)
  );
}

main().catch(err => {
  log(`❌ Fatal error: ${err.message}`);
  process.exit(1);
});
