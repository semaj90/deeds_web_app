#!/usr/bin/env node
/**
 * Svelte 5 Migration - Find and Fix Deprecated Syntax
 * Fixes: on:event -> onclick, on:input -> oninput, etc.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const fixes = [];
const errors = [];

// Event handler mappings
const eventMappings = {
  'on:click': 'onclick',
  'on:input': 'oninput',
  'on:change': 'onchange',
  'on:submit': 'onsubmit',
  'on:keydown': 'onkeydown',
  'on:keyup': 'onkeyup',
  'on:focus': 'onfocus',
  'on:blur': 'onblur',
  'on:mouseenter': 'onmouseenter',
  'on:mouseleave': 'onmouseleave',
  'on:mouseover': 'onmouseover',
  'on:mouseout': 'onmouseout'
};

function walkDir(dir, callback) {
  const files = readdirSync(dir);
  for (const file of files) {
    const filepath = join(dir, file);
    const stat = statSync(filepath);
    if (stat.isDirectory()) {
      if (!file.startsWith('.') && file !== 'node_modules') {
        walkDir(filepath, callback);
      }
    } else if (file.endsWith('.svelte')) {
      callback(filepath);
    }
  }
}

function fixFile(filepath) {
  try {
    let content = readFileSync(filepath, 'utf-8');
    let changed = false;
    const originalContent = content;

    // Fix on: event handlers
    for (const [oldSyntax, newSyntax] of Object.entries(eventMappings)) {
      const regex = new RegExp(oldSyntax + '=', 'g');
      if (content.match(regex)) {
        content = content.replace(regex, newSyntax + '=');
        changed = true;
        fixes.push(`${filepath}: ${oldSyntax} -> ${newSyntax}`);
      }
    }

    if (changed) {
      writeFileSync(filepath, content, 'utf-8');
      console.log(`✅ Fixed: ${filepath}`);
      return true;
    }
    return false;
  } catch (err) {
    errors.push(`❌ Error processing ${filepath}: ${err.message}`);
    return false;
  }
}

// Process all route files
console.log('🔍 Scanning for Svelte 5 migration issues...\n');

walkDir('src/routes', (filepath) => {
  fixFile(filepath);
});

// Also check components
walkDir('src/lib/components', (filepath) => {
  fixFile(filepath);
});

// Summary
console.log(`\n📊 Summary:`);
console.log(`✅ Fixed ${fixes.length} event handler conversions`);
if (errors.length > 0) {
  console.log(`❌ Errors: ${errors.length}`);
  errors.forEach(e => console.log(e));
}

if (fixes.length > 0) {
  console.log(`\n📝 Fixes applied:`);
  fixes.slice(0, 20).forEach(f => console.log(`  ${f}`));
  if (fixes.length > 20) {
    console.log(`  ... and ${fixes.length - 20} more`);
  }
}

console.log('\n✨ Migration complete!');
