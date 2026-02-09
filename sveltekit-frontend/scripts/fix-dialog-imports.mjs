#!/usr/bin/env node
/**
 * Fix Dialog Component Import Statements - Session 13
 *
 * Standardizes bits-ui Dialog imports to v2 namespace imports:
 * import * as Dialog from "bits-ui/components/dialog";
 *
 * NOTE: This script ONLY fixes bits-ui imports. Local custom Dialog
 * components in $lib/components/ui/dialog/ are kept as-is (already Svelte 5).
 *
 * Patterns fixed:
 * 1. import { Dialog } from 'bits-ui' (v1 pattern)
 * 2. import * as Dialog from 'bits-ui/Dialog' (wrong path)
 * 3. import * as Dialog from 'bits-ui/dist/bits/dialog' (internal path)
 * 4. import { Dialog } from "bits-ui" in any combination
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

    // Pattern 1: Named import from bits-ui (v1 pattern)
    // import { Dialog } from 'bits-ui';
    // import { Dialog } from "bits-ui";
    const namedPattern = /import\s*\{\s*Dialog\s*\}\s*from\s*['"]bits-ui['"];?\s*\n?/g;
    const namedMatches = [...modified.matchAll(namedPattern)];

    for (const match of namedMatches) {
      const replacement = `import * as Dialog from "bits-ui/components/dialog";\n`;
      modified = modified.replace(match[0], replacement);
      fileFixes++;
    }

    // Pattern 2: Namespace import with wrong path
    // import * as Dialog from 'bits-ui/Dialog';
    const wrongPathPattern = /import\s*\*\s*as\s*Dialog\s*from\s*['"]bits-ui\/Dialog['"];?\s*\n?/g;
    const wrongPathMatches = [...modified.matchAll(wrongPathPattern)];

    for (const match of wrongPathMatches) {
      const replacement = `import * as Dialog from "bits-ui/components/dialog";\n`;
      modified = modified.replace(match[0], replacement);
      fileFixes++;
    }

    // Pattern 3: Internal dist path (from type definitions)
    // import * as Dialog from 'bits-ui/dist/bits/dialog';
    const distPattern = /import\s*\*\s*as\s*Dialog\s*from\s*['"]bits-ui\/dist\/bits\/dialog['"];?\s*\n?/g;
    const distMatches = [...modified.matchAll(distPattern)];

    for (const match of distMatches) {
      const replacement = `import * as Dialog from "bits-ui/components/dialog";\n`;
      modified = modified.replace(match[0], replacement);
      fileFixes++;
    }

    // Pattern 4: Mixed imports with Dialog and other bits-ui components
    // import { Dialog, Button, Separator } from 'bits-ui';
    const mixedPattern = /import\s*\{([^}]*\bDialog\b[^}]*)\}\s*from\s*['"]bits-ui['"];?\s*\n?/g;
    const mixedMatches = [...modified.matchAll(mixedPattern)];

    for (const match of mixedMatches) {
      const allImports = match[1].split(',').map(i => i.trim());
      const hasDialog = allImports.some(i => i === 'Dialog');
      const nonDialogImports = allImports.filter(i => i !== 'Dialog');

      if (hasDialog) {
        let replacement = `import * as Dialog from "bits-ui/components/dialog";\n`;

        // Keep non-Dialog imports from bits-ui if any
        if (nonDialogImports.length > 0) {
          // These also need v2 imports, but that's for another script
          replacement += `import { ${nonDialogImports.join(', ')} } from 'bits-ui';\n`;
        }

        modified = modified.replace(match[0], replacement);
        fileFixes++;
      }
    }

    // Skip files that only import from $lib/components/ui/dialog (custom implementation)
    // No changes needed for those

    if (fileFixes > 0) {
      writeFileSync(filePath, modified, 'utf-8');
      filesModified++;
      totalFixes += fileFixes;
      console.log(`  ✓ Fixed ${fileFixes} Dialog import(s) in: ${path.relative(process.cwd(), filePath)}`);
    }

    totalFiles++;
  } catch (error) {
    console.error(`❌ Error in ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('🔧 Fixing bits-ui Dialog import statements...\n');
  console.log('📝 Strategy: Convert bits-ui v1 → v2 namespace imports\n');
  console.log('   Note: Custom Dialog in $lib/components/ui/dialog/ is NOT changed\n');

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
  console.log(`   Total Dialog import fixes: ${totalFixes}`);
  console.log('='.repeat(60));

  if (totalFixes > 0) {
    console.log('\n✨ Run `npm run check` to verify fixes');
    console.log('💡 Note: Custom Dialog wrappers in $lib/components/ui/dialog/ were not changed');
  } else {
    console.log('\n✓ No bits-ui Dialog import errors found');
  }
}

main().catch(console.error);