#!/usr/bin/env node
/**
 * Fix Card Component Import Statements - Session 13
 *
 * Standardizes Card component imports to use individual default imports:
 * import Card from '$lib/components/ui/card/Card.svelte';
 * import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
 * import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
 * import CardContent from '$lib/components/ui/card/CardContent.svelte';
 * import CardFooter from '$lib/components/ui/card/CardFooter.svelte';
 * import CardDescription from '$lib/components/ui/card/CardDescription.svelte';
 *
 * Patterns fixed:
 * 1. import { Card, CardHeader, ... } from "$lib/components/ui/card"
 * 2. import { Card, CardHeader, ... } from 'bits-ui'
 * 3. import { Card, CardHeader, ... } from "$lib/components/ui/enhanced-bits.svelte"
 * 4. Destructured imports with : syntax (corrupted)
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

let totalFiles = 0;
let totalFixes = 0;
let filesModified = 0;

// Card component names
const CARD_COMPONENTS = ['Card', 'CardHeader', 'CardTitle', 'CardContent', 'CardFooter', 'CardDescription'];

async function fixFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    let modified = content;
    let fileFixes = 0;

    // Pattern 1: Named imports from directory
    // import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
    const directoryPattern = /import\s*\{([^}]+)\}\s*from\s*["']\$lib\/components\/ui\/card["'];?\s*\n?/g;
    const directoryMatches = [...modified.matchAll(directoryPattern)];

    for (const match of directoryMatches) {
      const importedComponents = match[1]
        .split(',')
        .map(c => c.trim())
        .filter(c => CARD_COMPONENTS.includes(c));

      if (importedComponents.length > 0) {
        const individualImports = importedComponents
          .map(comp => `import ${comp} from '$lib/components/ui/card/${comp}.svelte';`)
          .join('\n');

        modified = modified.replace(match[0], individualImports + '\n');
        fileFixes += importedComponents.length;
      }
    }

    // Pattern 2: Named imports from bits-ui
    // import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Progress } from 'bits-ui';
    const bitsUiPattern = /import\s*\{([^}]+)\}\s*from\s*['"]bits-ui['"];?\s*\n?/g;
    const bitsUiMatches = [...modified.matchAll(bitsUiPattern)];

    for (const match of bitsUiMatches) {
      const allImports = match[1].split(',').map(c => c.trim());
      const cardImports = allImports.filter(c => CARD_COMPONENTS.includes(c));
      const nonCardImports = allImports.filter(c => !CARD_COMPONENTS.includes(c));

      if (cardImports.length > 0) {
        const cardIndividualImports = cardImports
          .map(comp => `import ${comp} from '$lib/components/ui/card/${comp}.svelte';`)
          .join('\n');

        let replacement = cardIndividualImports + '\n';

        // Keep non-Card imports from bits-ui if any
        if (nonCardImports.length > 0) {
          replacement += `import { ${nonCardImports.join(', ')} } from 'bits-ui';\n`;
        }

        modified = modified.replace(match[0], replacement);
        fileFixes += cardImports.length;
      }
    }

    // Pattern 3: Named imports from enhanced-bits
    // import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/enhanced-bits.svelte";
    const enhancedBitsPattern = /import\s*\{([^}]+)\}\s*from\s*["']\$lib\/components\/ui\/enhanced-bits(?:\.svelte)?["'];?\s*\n?/g;
    const enhancedBitsMatches = [...modified.matchAll(enhancedBitsPattern)];

    for (const match of enhancedBitsMatches) {
      const allImports = match[1].split(',').map(c => c.trim());
      const cardImports = allImports.filter(c => CARD_COMPONENTS.includes(c));
      const nonCardImports = allImports.filter(c => !CARD_COMPONENTS.includes(c));

      if (cardImports.length > 0) {
        const cardIndividualImports = cardImports
          .map(comp => `import ${comp} from '$lib/components/ui/card/${comp}.svelte';`)
          .join('\n');

        let replacement = cardIndividualImports + '\n';

        // Keep non-Card imports from enhanced-bits if any
        if (nonCardImports.length > 0) {
          replacement += `import { ${nonCardImports.join(', ')} } from '$lib/components/ui/enhanced-bits.svelte';\n`;
        }

        modified = modified.replace(match[0], replacement);
        fileFixes += cardImports.length;
      }
    }

    // Pattern 4: Destructured imports with : syntax (corrupted)
    // import { Card: CardHeader: CardTitle, CardContent } from "$lib/components/ui/enhanced-bits.svelte";
    const corruptedPattern = /import\s*\{\s*(Card[^}]*)\}\s*from\s*["']\$lib\/components\/ui\/enhanced-bits(?:\.svelte)?["'];?\s*\n?/g;
    const corruptedMatches = [...modified.matchAll(corruptedPattern)];

    for (const match of corruptedMatches) {
      // Extract all Card-related identifiers (split by : or ,)
      const imports = match[1].split(/[,:]\s*/).map(c => c.trim());
      const cardImports = imports.filter(c => CARD_COMPONENTS.includes(c));

      if (cardImports.length > 0) {
        const individualImports = cardImports
          .map(comp => `import ${comp} from '$lib/components/ui/card/${comp}.svelte';`)
          .join('\n');

        modified = modified.replace(match[0], individualImports + '\n');
        fileFixes += cardImports.length;
      }
    }

    if (fileFixes > 0) {
      writeFileSync(filePath, modified, 'utf-8');
      filesModified++;
      totalFixes += fileFixes;
      console.log(`  ✓ Fixed ${fileFixes} Card import(s) in: ${path.relative(process.cwd(), filePath)}`);
    }

    totalFiles++;
  } catch (error) {
    console.error(`❌ Error in ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('🔧 Fixing Card component import statements...\n');

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
  console.log(`   Total Card import fixes: ${totalFixes}`);
  console.log('='.repeat(60));

  if (totalFixes > 0) {
    console.log('\n✨ Run `npm run check` to verify fixes');
  } else {
    console.log('\n✓ No Card import errors found');
  }
}

main().catch(console.error);