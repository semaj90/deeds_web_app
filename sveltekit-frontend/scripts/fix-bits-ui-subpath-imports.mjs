#!/usr/bin/env node
/**
 * Fix bits-ui Subpath Imports - Revert to Main Entry Point
 *
 * bits-ui v2.14.4+ only exports from the main entry point "bits-ui".
 * There are NO subpath exports like "bits-ui/components/dialog".
 *
 * This script converts:
 *   import * as Dialog from "bits-ui/components/dialog";
 * To:
 *   import { Dialog } from "bits-ui";
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

let totalFiles = 0;
let totalFixes = 0;
let filesModified = 0;

// All known bits-ui component names
const componentNames = [
  'Accordion', 'AlertDialog', 'AspectRatio', 'Avatar',
  'Button', 'Calendar', 'Checkbox', 'Collapsible',
  'Combobox', 'Command', 'ContextMenu',
  'DateField', 'DatePicker', 'DateRangeField', 'DateRangePicker',
  'Dialog', 'DropdownMenu',
  'Label', 'LinkPreview',
  'Menubar', 'Meter', 'NavigationMenu',
  'Pagination', 'PinInput', 'Popover', 'Progress',
  'RadioGroup', 'RangeCalendar', 'RatingGroup',
  'ScrollArea', 'Select', 'Separator', 'Slider', 'Switch',
  'Tabs', 'TimeField', 'TimeRangeField',
  'Toggle', 'ToggleGroup', 'Toolbar', 'Tooltip',
];

async function fixFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    let modified = content;
    let fileFixes = 0;

    for (const name of componentNames) {
      // Pattern: import * as ComponentName from "bits-ui/components/component-name";
      // Also handles single quotes and optional semicolons
      const pattern = new RegExp(
        `import\\s*\\*\\s*as\\s*${name}\\s*from\\s*["']bits-ui/components/[a-z-]+["'];?\\s*\\n?`,
        'g'
      );

      const matches = [...modified.matchAll(pattern)];
      for (const match of matches) {
        const replacement = `import { ${name} } from "bits-ui";\n`;
        modified = modified.replace(match[0], replacement);
        fileFixes++;
      }

      // Also fix: import * as ComponentName from "bits-ui/component-name" (without /components/)
      const altPattern = new RegExp(
        `import\\s*\\*\\s*as\\s*${name}\\s*from\\s*["']bits-ui/[a-z-]+["'];?\\s*\\n?`,
        'g'
      );

      const altMatches = [...modified.matchAll(altPattern)];
      for (const match of altMatches) {
        // Skip if it's the main bits-ui import
        if (match[0].includes('from "bits-ui"') || match[0].includes("from 'bits-ui'")) continue;
        // Skip if it's bits-ui/dist (type definitions)
        if (match[0].includes('bits-ui/dist')) continue;

        const replacement = `import { ${name} } from "bits-ui";\n`;
        modified = modified.replace(match[0], replacement);
        fileFixes++;
      }
    }

    if (fileFixes > 0) {
      writeFileSync(filePath, modified, 'utf-8');
      filesModified++;
      totalFixes += fileFixes;
      console.log(`  ✓ Fixed ${fileFixes} import(s) in: ${path.relative(process.cwd(), filePath)}`);
    }

    totalFiles++;
  } catch (error) {
    console.error(`❌ Error in ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('🔧 Fixing bits-ui subpath imports → main entry point...\n');
  console.log('   bits-ui v2.14.4+ only exports from "bits-ui" (no subpaths)\n');
  console.log('   import * as Dialog from "bits-ui/components/dialog"');
  console.log('   → import { Dialog } from "bits-ui";\n');

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
  console.log(`   Total import fixes: ${totalFixes}`);
  console.log('='.repeat(60));
}

main().catch(console.error);