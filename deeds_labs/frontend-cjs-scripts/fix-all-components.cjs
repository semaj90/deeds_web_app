#!/usr/bin/env node

/**
 * Comprehensive Component Fixer for Svelte 5 Migration
 * Fixes common issues across all components
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// Common fixes to apply
const fixes = [
  // TypeScript type fixes
  { pattern: /unknownn/g, replacement: 'unknown' },
  { pattern: /\bDat\b/g, replacement: 'Date' },
  { pattern: /Evidenc([^e])/g, replacement: 'Evidence$1' },

  // Svelte 5 migration fixes
  { pattern: /export let (\w+)/g, replacement: 'let { $1 } = $props()' },
  { pattern: /onclick=/g, replacement: 'onclick=' }, // Keep as-is, already correct for Svelte 5

  // CSS fixes
  { pattern: /overflow: hidden;\n;/g, replacement: 'overflow: hidden;' },
  { pattern: /-webkit-line-clamp:\s*(\d+);\s*\n\s*-webkit-box-orient:\s*vertical;\s*\n\s*display:\s*-webkit-box;\s*\n\s*-webkit-line-clamp:\s*\1;/g,
    replacement: '-webkit-line-clamp: $1;\n    -webkit-box-orient: vertical;' },

  // Syntax error fixes
  { pattern: /,;/g, replacement: ',' },
  { pattern: /\{;/g, replacement: '{' },
  { pattern: /;}/g, replacement: '}' },

  // Import fixes
  { pattern: /from '\$lib\/components\/ui\/button\/Button\.svelte'/g, replacement: "from '$lib/components/ui/Button.svelte'" },
  { pattern: /from '\$lib\/components\/ui\/enhanced-bits\/Button\.svelte'/g, replacement: "from '$lib/components/ui/Button.svelte'" },
];

async function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // Apply all fixes
    fixes.forEach(fix => {
      const originalContent = content;
      content = content.replace(fix.pattern, fix.replacement);
      if (content !== originalContent) {
        modified = true;
      }
    });

    // Write back if modified
    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Fixed: ${filePath}`);
      return 1;
    }

    return 0;
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error.message);
    return 0;
  }
}

async function main() {
  console.log('🔧 Starting comprehensive component fixes...\n');

  // Find all component files
  const componentFiles = await glob('src/lib/components/**/*.{svelte,ts,js}', { cwd: process.cwd() });
  const routeFiles = await glob('src/routes/**/*.{svelte,ts,js}', { cwd: process.cwd() });

  const allFiles = [...componentFiles, ...routeFiles];

  console.log(`Found ${allFiles.length} files to check...\n`);

  let fixedCount = 0;

  for (const file of allFiles) {
    fixedCount += await fixFile(file);
  }

  console.log(`\n🎉 Fixed ${fixedCount} files out of ${allFiles.length} total files.`);

  if (fixedCount > 0) {
    console.log('\n📋 Next steps:');
    console.log('1. Run: npm run check');
    console.log('2. Test your application');
    console.log('3. Commit the fixes');
  }
}

main().catch(console.error);