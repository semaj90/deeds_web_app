#!/usr/bin/env node
/**
 * Fix Select Component Import Statements - Session 13
 *
 * Standardizes Select component imports to use bits-ui v2 namespace imports:
 * import * as Select from "bits-ui/components/select";
 *
 * Rationale: Svelte 5 runes make barrel exports obsolete. Use bits-ui directly.
 *
 * Patterns fixed:
 * 1. import { Select, SelectContent, ... } from '$lib/components/ui/select/index.ts'
 * 2. import { Select } from 'bits-ui' (v1 pattern)
 * 3. import { Select } from "$lib/components/ui/enhanced-bits.svelte"
 * 4. Individual component imports from local wrappers
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

let totalFiles = 0;
let totalFixes = 0;
let filesModified = 0;

async function fixFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    let modified = content;
    let fileFixes = 0;

    // Pattern 1: Named imports from local directory
    // import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '$lib/components/ui/select/index.ts';
    const localPattern = /import\s*\{\s*([^}]*Select[^}]*)\}\s*from\s*["']\$lib\/components\/ui\/select(?:\/index\.ts)?["'];?\s*\n?/g;
    const localMatches = [...modified.matchAll(localPattern)];

    for (const match of localMatches) {
      // Replace with bits-ui v2 namespace import
      const replacement = `import * as Select from "bits-ui/components/select";\n`;
      modified = modified.replace(match[0], replacement);
      fileFixes++;
    }

    // Pattern 2: Named imports from bits-ui v1
    // import { Select } from 'bits-ui';
    const bitsUIV1Pattern = /import\s*\{\s*Select\s*\}\s*from\s*['"]bits-ui['"];?\s*\n?/g;
    const bitsUIV1Matches = [...modified.matchAll(bitsUIV1Pattern)];

    for (const match of bitsUIV1Matches) {
      const replacement = `import * as Select from "bits-ui/components/select";\n`;
      modified = modified.replace(match[0], replacement);
      fileFixes++;
    }

    // Pattern 3: Named imports from enhanced-bits
    // import { Select } from "$lib/components/ui/enhanced-bits.svelte";
    const enhancedBitsPattern = /import\s*\{\s*([^}]*Select[^}]*)\}\s*from\s*["']\$lib\/components\/ui\/enhanced-bits(?:\.svelte)?["'];?\s*\n?/g;
    const enhancedBitsMatches = [...modified.matchAll(enhancedBitsPattern)];

    for (const match of enhancedBitsMatches) {
      const allImports = match[1].split(',').map(c => c.trim());
      const hasSelect = allImports.some(i => i.includes('Select'));
      const nonSelectImports = allImports.filter(i => !i.includes('Select'));

      if (hasSelect) {
        let replacement = `import * as Select from "bits-ui/components/select";\n`;

        // Keep non-Select imports from enhanced-bits if any
        if (nonSelectImports.length > 0) {
          replacement += `import { ${nonSelectImports.join(', ')} } from '$lib/components/ui/enhanced-bits.svelte';\n`;
        }

        modified = modified.replace(match[0], replacement);
        fileFixes++;
      }
    }

    // Pattern 4: Single default import from MeltSelect
    // import { Select } from "$lib/components/ui/MeltSelect.svelte";
    const meltSelectPattern = /import\s*\{\s*Select\s*\}\s*from\s*["']\$lib\/components\/ui\/MeltSelect\.svelte["'];?\s*\n?/g;
    const meltSelectMatches = [...modified.matchAll(meltSelectPattern)];

    for (const match of meltSelectMatches) {
      const replacement = `import * as Select from "bits-ui/components/select";\n`;
      modified = modified.replace(match[0], replacement);
      fileFixes++;
    }

    if (fileFixes > 0) {
      writeFileSync(filePath, modified, 'utf-8');
      filesModified++;
      totalFixes += fileFixes;
      console.log(`  ✓ Fixed ${fileFixes} Select import(s) in: ${path.relative(process.cwd(), filePath)}`);
    }

    totalFiles++;
  } catch (error) {
    console.error(`❌ Error in ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('🔧 Fixing Select component import statements...\n');
  console.log('📝 Strategy: Replace local wrappers with bits-ui v2 namespace imports\n');
  console.log('   Rationale: Svelte 5 runes make barrel exports obsolete\n');

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
  console.log(`   Total Select import fixes: ${totalFixes}`);
  console.log('='.repeat(60));

  if (totalFixes > 0) {
    console.log('\n✨ Run `npm run check` to verify fixes');
    console.log('💡 Note: Local Select wrappers can be archived after migration');
  } else {
    console.log('\n✓ No Select import errors found');
  }
}

main().catch(console.error);
