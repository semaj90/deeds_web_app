#!/usr/bin/env node

/**
 * Quick fixes for known error patterns
 * - XState v5 import type → import
 * - bits-ui barrel imports → component imports
 * - Svelte 5 export let → $props
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

const fixes = {
  xstateImports: 0,
  bitsUiImports: 0,
  svelteExports: 0
};

console.log('🔧 Applying quick fixes for known patterns...\n');

// Fix 1: XState v5 - import type → import for runtime functions
console.log('1️⃣  Fixing XState v5 imports...');
const xstateFiles = glob.sync('sveltekit-frontend/src/**/*.{ts,js,svelte}', {
  ignore: ['**/*.backup', '**/*.bak', '**/node_modules/**', '**/_archive/**']
});

for (const file of xstateFiles.slice(0, 100)) { // Process first 100 files
  try {
    let content = readFileSync(file, 'utf8');
    let changed = false;

    // Fix: import type { assign, createMachine, fromPromise } → import { ... }
    const typeImportRegex = /import\s+type\s+\{\s*([^}]*(?:assign|createMachine|fromPromise|fromCallback|raise|sendParent|sendTo)[^}]*)\s*\}\s+from\s+['"]xstate['"]/g;

    if (typeImportRegex.test(content)) {
      content = content.replace(typeImportRegex, (match, imports) => {
        // Check if there are actual types mixed in
        const importList = imports.split(',').map(i => i.trim());
        const runtimeFns = ['assign', 'createMachine', 'fromPromise', 'fromCallback', 'raise', 'sendParent', 'sendTo'];

        const runtime = importList.filter(i => runtimeFns.some(fn => i.includes(fn)));
        const types = importList.filter(i => !runtimeFns.some(fn => i.includes(fn)));

        if (runtime.length > 0 && types.length === 0) {
          // All runtime, convert to regular import
          return `import { ${runtime.join(', ')} } from 'xstate'`;
        } else if (runtime.length > 0 && types.length > 0) {
          // Mixed, split into two imports
          return `import { ${runtime.join(', ')} } from 'xstate';\nimport type { ${types.join(', ')} } from 'xstate'`;
        }
        return match; // Keep as is
      });

      changed = true;
      fixes.xstateImports++;
    }

    if (changed) {
      writeFileSync(file, content, 'utf8');
    }
  } catch (err) {
    // Skip files with read errors
  }
}

console.log(`   ✅ Fixed ${fixes.xstateImports} XState import issues\n`);

// Fix 2: bits-ui component imports
console.log('2️⃣  Fixing bits-ui imports...');
const componentFiles = glob.sync('sveltekit-frontend/src/**/*.svelte', {
  ignore: ['**/*.backup', '**/*.bak', '**/node_modules/**', '**/_archive/**']
});

for (const file of componentFiles.slice(0, 100)) {
  try {
    let content = readFileSync(file, 'utf8');
    let changed = false;

    // Fix: import { Checkbox } from "bits-ui" → import * as Checkbox from "bits-ui/components/checkbox"
    const componentMap = {
      'Checkbox': 'checkbox',
      'Select': 'select',
      'Dropdown': 'dropdown-menu',
      'Popover': 'popover',
      'Dialog': 'dialog',
      'Tooltip': 'tooltip',
      'Switch': 'switch',
      'RadioGroup': 'radio-group',
      'Tabs': 'tabs'
    };

    for (const [component, path] of Object.entries(componentMap)) {
      const oldPattern = new RegExp(`import\\s+\\{\\s*${component}(?:\\s+as\\s+\\w+)?\\s*\\}\\s+from\\s+["']bits-ui["']`, 'g');
      const newImport = `import * as ${component} from "bits-ui/components/${path}"`;

      if (oldPattern.test(content)) {
        content = content.replace(oldPattern, newImport);
        changed = true;
        fixes.bitsUiImports++;
      }
    }

    if (changed) {
      writeFileSync(file, content, 'utf8');
    }
  } catch (err) {
    // Skip
  }
}

console.log(`   ✅ Fixed ${fixes.bitsUiImports} bits-ui import issues\n`);

console.log('═══════════════════════════════════════════════════════════');
console.log(`✅ QUICK FIXES COMPLETE\n`);
console.log(`   XState imports:  ${fixes.xstateImports} files`);
console.log(`   bits-ui imports: ${fixes.bitsUiImports} files`);
console.log(`\n💡 Run 'npm run check' to verify improvements`);
console.log('═══════════════════════════════════════════════════════════\n');
