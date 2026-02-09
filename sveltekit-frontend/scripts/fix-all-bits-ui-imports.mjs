#!/usr/bin/env node
/**
 * Fix All bits-ui Component Imports - Session 13
 *
 * Standardizes ALL bits-ui imports to v2 namespace pattern:
 * import * as ComponentName from "bits-ui/components/component-name";
 *
 * Components fixed:
 * - DropdownMenu (Dropdown → dropdown-menu)
 * - Accordion
 * - Tooltip
 * - Popover
 * - Tabs
 * - Any other bits-ui components using v1 patterns
 *
 * Patterns fixed:
 * 1. import { ComponentName } from 'bits-ui' (v1 named import)
 * 2. import * as ComponentName from 'bits-ui/component-name' (wrong path - missing /components/)
 * 3. import { ComponentName } from "bits-ui" in any combination
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

let totalFiles = 0;
let totalFixes = 0;
let filesModified = 0;

// Map of component names to their correct paths
const componentMap = {
  'Accordion': 'accordion',
  'Tooltip': 'tooltip',
  'Popover': 'popover',
  'Tabs': 'tabs',
  'DropdownMenu': 'dropdown-menu',
  'Dropdown': 'dropdown-menu', // Alias
  'Checkbox': 'checkbox',
  'RadioGroup': 'radio-group',
  'Switch': 'switch',
  'Slider': 'slider',
  'Progress': 'progress',
  'Separator': 'separator',
  'Label': 'label',
  'Select': 'select', // High-impact component
  'Dialog': 'dialog', // High-impact component
  'Command': 'command',
  'Collapsible': 'collapsible',
  'ContextMenu': 'context-menu',
  'Menubar': 'menubar',
  'NavigationMenu': 'navigation-menu',
  'ScrollArea': 'scroll-area',
  'Toggle': 'toggle',
  'ToggleGroup': 'toggle-group'
};

async function fixFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    let modified = content;
    let fileFixes = 0;

    for (const [componentName, componentPath] of Object.entries(componentMap)) {
      // Pattern 1: Named import from bits-ui (v1)
      // import { Accordion } from 'bits-ui';
      const namedPattern = new RegExp(
        `import\\s*\\{\\s*${componentName}\\s*\\}\\s*from\\s*['"]bits-ui['"];?\\s*\\n?`,
        'g'
      );
      const namedMatches = [...modified.matchAll(namedPattern)];

      for (const match of namedMatches) {
        const replacement = `import * as ${componentName} from "bits-ui/components/${componentPath}";\n`;
        modified = modified.replace(match[0], replacement);
        fileFixes++;
      }

      // Pattern 2: Wrong path (missing /components/)
      // import * as Accordion from 'bits-ui/accordion';
      const wrongPathPattern = new RegExp(
        `import\\s*\\*\\s*as\\s*${componentName}\\s*from\\s*['"]bits-ui/${componentPath}['"];?\\s*\\n?`,
        'g'
      );
      const wrongPathMatches = [...modified.matchAll(wrongPathPattern)];

      for (const match of wrongPathMatches) {
        const replacement = `import * as ${componentName} from "bits-ui/components/${componentPath}";\n`;
        modified = modified.replace(match[0], replacement);
        fileFixes++;
      }

      // Pattern 3: Mixed imports with component and others
      // import { Accordion, Button } from 'bits-ui';
      const mixedPattern = new RegExp(
        `import\\s*\\{([^}]*\\b${componentName}\\b[^}]*)\\}\\s*from\\s*['"]bits-ui['"];?\\s*\\n?`,
        'g'
      );
      const mixedMatches = [...modified.matchAll(mixedPattern)];

      for (const match of mixedMatches) {
        const allImports = match[1].split(',').map(i => i.trim());
        const hasComponent = allImports.some(i => i === componentName);
        const nonComponentImports = allImports.filter(i => i !== componentName);

        if (hasComponent) {
          let replacement = `import * as ${componentName} from "bits-ui/components/${componentPath}";\n`;

          // Keep non-component imports (will be fixed in their own iteration)
          if (nonComponentImports.length > 0) {
            replacement += `import { ${nonComponentImports.join(', ')} } from 'bits-ui';\n`;
          }

          modified = modified.replace(match[0], replacement);
          fileFixes++;
        }
      }
    }

    if (fileFixes > 0) {
      writeFileSync(filePath, modified, 'utf-8');
      filesModified++;
      totalFixes += fileFixes;
      console.log(`  ✓ Fixed ${fileFixes} bits-ui import(s) in: ${path.relative(process.cwd(), filePath)}`);
    }

    totalFiles++;
  } catch (error) {
    console.error(`❌ Error in ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('🔧 Fixing ALL bits-ui component imports...\n');
  console.log('📝 Strategy: Convert bits-ui v1 → v2 namespace imports\n');
  console.log('   Components: Accordion, Tooltip, Popover, Tabs, DropdownMenu, etc.\n');

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
  console.log(`   Total bits-ui import fixes: ${totalFixes}`);
  console.log('='.repeat(60));

  if (totalFixes > 0) {
    console.log('\n✨ Run `npm run check` to verify fixes');
    console.log('💡 Components fixed: Accordion, Tooltip, Popover, Tabs, DropdownMenu, etc.');
  } else {
    console.log('\n✓ No bits-ui import errors found');
  }
}

main().catch(console.error);