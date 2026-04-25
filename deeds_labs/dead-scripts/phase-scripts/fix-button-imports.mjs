#!/usr/bin/env node
/**
 * Fix Button Import Statements - Session 13
 *
 * Standardizes Button component imports to use default import:
 * import Button from '$lib/components/ui/Button.svelte';
 *
 * Patterns fixed:
 * 1. import { Button } from "$lib/components/ui/button"
 * 2. import { Button } from '$lib/components/ui/enhanced-bits'
 * 3. import Button from "$lib/components/ui/button/Button.svelte"
 * 4. import Button from "$lib/components/ui/bitsButton.svelte"
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

let totalFiles = 0;
let totalFixes = 0;
let filesModified = 0;

// Patterns to fix
const BUTTON_IMPORT_PATTERNS = [
  {
    name: 'Named import from directory',
    regex: /import\s*\{\s*Button\s*\}\s*from\s*["'](\$lib\/components\/ui\/button|bits-ui\/components\/button)["'];?/g,
    replacement: "import Button from '$lib/components/ui/Button.svelte';"
  },
  {
    name: 'Named import from enhanced-bits',
    regex: /import\s*\{\s*Button\s*\}\s*from\s*["']\$lib\/components\/ui\/enhanced-bits["'];?/g,
    replacement: "import Button from '$lib/components/ui/Button.svelte';"
  },
  {
    name: 'Wrong subdirectory path',
    regex: /import\s+Button\s+from\s*["']\$lib\/components\/ui\/button\/Button\.svelte["'];?/g,
    replacement: "import Button from '$lib/components/ui/Button.svelte';"
  },
  {
    name: 'bitsButton.svelte import',
    regex: /import\s+(?:\{\s*)?Button(?:\s*\})?\s+from\s*["']\$lib\/components\/ui\/bitsButton\.svelte["'];?/g,
    replacement: "import Button from '$lib/components/ui/Button.svelte';"
  },
  {
    name: 'Namespace import from button directory',
    regex: /import\s+\*\s+as\s+Button\s+from\s*["']\$lib\/components\/ui\/button["'];?/g,
    replacement: "import Button from '$lib/components/ui/Button.svelte';"
  }
];

async function fixFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    let modified = content;
    let fileFixes = 0;

    for (const pattern of BUTTON_IMPORT_PATTERNS) {
      const matches = modified.match(pattern.regex);
      if (matches) {
        modified = modified.replace(pattern.regex, pattern.replacement);
        fileFixes += matches.length;
        console.log(`  ✓ Fixed ${matches.length} "${pattern.name}" in: ${path.relative(process.cwd(), filePath)}`);
      }
    }

    if (fileFixes > 0) {
      writeFileSync(filePath, modified, 'utf-8');
      filesModified++;
      totalFixes += fileFixes;
    }

    totalFiles++;
  } catch (error) {
    console.error(`❌ Error in ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('🔧 Fixing Button import statements...\n');

  // Search all TypeScript/Svelte files (exclude archives/backups)
  const files = await glob('src/**/*.{ts,tsx,svelte}', {
    cwd: process.cwd(),
    ignore: ['**/_archive/**', '**/*.bak*', '**/*.backup*', '**/routes_parked/**', '**/node_modules/**'],
  });

  console.log(`Checking ${files.length} files\n`);

  for (const file of files) {
    await fixFile(file);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Files checked: ${totalFiles}`);
  console.log(`   Files modified: ${filesModified}`);
  console.log(`   Total Button import fixes: ${totalFixes}`);
  console.log('='.repeat(60));

  if (totalFixes > 0) {
    console.log('\n✨ Run `npm run check` to verify fixes');
  } else {
    console.log('\n✓ No Button import errors found');
  }
}

main().catch(console.error);
