#!/usr/bin/env node
/**
 * Fix Colon-Separated Import Corruption
 *
 * Pattern: import { Card: CardHeader: CardTitle, CardContent } from "..."
 * Should be: import Card from '...'; import CardHeader from '...'; etc.
 *
 * This handles corrupted imports where colons replaced commas
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

const componentMap = {
  Button: `import Button from '$lib/components/ui/Button.svelte';`,
  Card: `import Card from '$lib/components/ui/Card/Card.svelte';`,
  CardHeader: `import CardHeader from '$lib/components/ui/Card/CardHeader.svelte';`,
  CardTitle: `import CardTitle from '$lib/components/ui/Card/CardTitle.svelte';`,
  CardContent: `import CardContent from '$lib/components/ui/Card/CardContent.svelte';`,
  CardDescription: `import CardDescription from '$lib/components/ui/Card/CardDescription.svelte';`,
  CardFooter: `import CardFooter from '$lib/components/ui/Card/CardFooter.svelte';`,
  Input: `import Input from '$lib/components/ui/Input.svelte';`,
  Label: `import Label from '$lib/components/ui/Label.svelte';`,
  Dialog: `import * as Dialog from '$lib/components/ui/Dialog.svelte';`,
  Select: `import * as Select from '$lib/components/ui/Select.svelte';`,
  Progress: `import Progress from '$lib/components/ui/Progress.svelte';`,
  Alert: `import Alert from '$lib/components/ui/Alert.svelte';`,
  AlertDescription: `import AlertDescription from '$lib/components/ui/AlertDescription.svelte';`,
  Badge: `import Badge from '$lib/components/ui/Badge.svelte';`,
  Checkbox: `import Checkbox from '$lib/components/ui/Checkbox.svelte';`,
  Separator: `import Separator from '$lib/components/ui/Separator.svelte';`,
  Textarea: `import Textarea from '$lib/components/ui/Textarea.svelte';`,
  Form: `import Form from '$lib/components/ui/Form.svelte';`,
};

let totalFiles = 0;
let totalFixes = 0;
let filesModified = 0;

async function fixFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    let modified = content;
    let fileFixes = 0;

    // Pattern: import { Card: CardHeader: CardTitle, CardContent } from "$lib/components/ui/enhanced-bits.svelte"
    // Also matches: import  Card: CardHeader: CardTitle  from "..." (default import style)
    const colonImportPattern = /import\s+\{?\s*([^}]+?)\s*\}?\s+from\s+["'](\$lib\/components\/ui\/enhanced-bits(?:\.svelte)?|@\/lib\/components\/ui\/enhanced-bits(?:\.svelte)?)["'];?/g;

    const matches = [...modified.matchAll(colonImportPattern)];

    for (const match of matches) {
      const componentsStr = match[1];

      // Check if this has colon-separated components
      if (!componentsStr.includes(':')) continue;

      // Split by both colons and commas
      const components = componentsStr
        .split(/[:, ]+/)
        .map(c => c.trim())
        .filter(c => {
          // Filter out noise words
          const lowerC = c.toLowerCase();
          return (
            c && // not empty
            c !== 'as' &&
            c !== 'const' &&
            !lowerC.startsWith('from') &&
            c !== '{' &&
            c !== '}'
          );
        });

      // Build replacement imports
      const replacements = components
        .filter(comp => componentMap[comp])
        .map(comp => componentMap[comp]);

      if (replacements.length > 0) {
        // Replace the entire import statement
        modified = modified.replace(match[0], replacements.join('\n'));
        fileFixes++;
        console.log(`  🔧 Fixed in ${path.basename(filePath)}: ${components.join(', ')}`);
      }
    }

    if (fileFixes > 0) {
      writeFileSync(filePath, modified, 'utf-8');
      filesModified++;
      totalFixes += fileFixes;
      console.log(`✅ Fixed ${fileFixes} corrupted import(s) in: ${path.relative(process.cwd(), filePath)}`);
    }

    totalFiles++;
  } catch (error) {
    console.error(`❌ Error ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('🔍 Fixing colon-separated import errors...\n');

  const files = await glob('src/**/*.{svelte,ts}', {
    cwd: process.cwd(),
    ignore: ['**/routes_parked/**', '**/*.bak*', '**/*.backup*', '**/_archive/**', '**/node_modules/**'],
  });

  console.log(`Checking ${files.length} files\n`);

  for (const file of files) {
    await fixFile(file);
  }

  console.log('\n📊 Summary:');
  console.log(`   Files checked: ${totalFiles}`);
  console.log(`   Files modified: ${filesModified}`);
  console.log(`   Total import fixes: ${totalFixes}`);

  if (totalFixes > 0) {
    console.log('\n✨ Run npm run check to verify');
  } else {
    console.log('\n✅ No colon-separated imports found!');
  }
}

main().catch(console.error);
