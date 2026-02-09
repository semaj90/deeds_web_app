#!/usr/bin/env node
/**
 * Fix Enhanced Bits Import Errors
 *
 * Problem: enhanced-bits.svelte is a Button component, but many files
 * try to import Card, CardHeader, etc. from it (which don't exist)
 *
 * Solution: Replace with correct individual component imports
 *
 * Expected Impact: ~50-75 cascading error fixes
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

// Component mapping: enhanced-bits import → correct path
const componentMap = {
  Button: `import Button from '$lib/components/ui/Button.svelte';`,
  Card: `import Card from '$lib/components/ui/Card.svelte';`,
  CardHeader: `import CardHeader from '$lib/components/ui/CardHeader.svelte';`,
  CardTitle: `import CardTitle from '$lib/components/ui/CardTitle.svelte';`,
  CardContent: `import CardContent from '$lib/components/ui/CardContent.svelte';`,
  CardDescription: `import CardDescription from '$lib/components/ui/CardDescription.svelte';`,
  CardFooter: `import CardFooter from '$lib/components/ui/CardFooter.svelte';`,
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
};

let totalFiles = 0;
let totalFixes = 0;
let filesModified = 0;

async function fixFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    let modified = content;
    let fileFixes = 0;

    // Pattern 1: import { Button, Card, ... } from "$lib/components/ui/enhanced-bits.svelte"
    // Pattern 1a: import { Card: CardHeader: CardTitle } from "..." (corrupted with colons)
    const namedImportPattern = /import\s+\{([^}]+)\}\s+from\s+["'](\$lib\/components\/ui\/enhanced-bits\.svelte|@\/lib\/components\/ui\/enhanced-bits\.svelte)["'];?/g;

    const matches = [...modified.matchAll(namedImportPattern)];

    for (const match of matches) {
      const componentsStr = match[1];

      // Split by both commas and colons (handles corrupted imports like "Card: CardHeader: CardTitle")
      const components = componentsStr.split(/[,:]+/).map(c => {
        // Handle "Card as MyCard" syntax and "as const" patterns
        const cleaned = c.trim();
        if (cleaned.includes(' as ') && !cleaned.endsWith(' as const')) {
          const parts = cleaned.split(/\s+as\s+/);
          return parts[0].trim();
        }
        return cleaned;
      }).filter(c => c && c !== 'const'); // Remove empty and "const" fragments

      // Build replacement imports
      const replacements = components
        .filter(comp => componentMap[comp])
        .map(comp => componentMap[comp]);

      if (replacements.length > 0) {
        // Replace the import statement with individual imports
        modified = modified.replace(match[0], replacements.join('\n'));
        fileFixes++;
      }
    }

    // Pattern 2: import Button from "$lib/components/ui/enhanced-bits.svelte"
    // This is actually correct if they want the Button component, but confusing
    // Let's replace it with the standard Button import for clarity
    const defaultImportPattern = /import\s+Button\s+from\s+["'](\$lib\/components\/ui\/enhanced-bits\.svelte|@\/lib\/components\/ui\/enhanced-bits\.svelte)["'];?/g;

    modified = modified.replace(defaultImportPattern, () => {
      fileFixes++;
      return componentMap.Button;
    });

    if (fileFixes > 0) {
      writeFileSync(filePath, modified, 'utf-8');
      filesModified++;
      totalFixes += fileFixes;
      console.log(`✅ Fixed ${fileFixes} import(s) in: ${path.relative(process.cwd(), filePath)}`);
    }

    totalFiles++;
  } catch (error) {
    console.error(`❌ Error ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('🔍 Fixing enhanced-bits.svelte import errors...\n');

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
  }
}

main().catch(console.error);
