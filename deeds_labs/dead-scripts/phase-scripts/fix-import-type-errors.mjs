#!/usr/bin/env node
/**
 * Fix import type errors - functions imported with 'import type' but used as values
 * This is a common error when migrating to Svelte 5
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

// List of common functions that should NOT be imported with 'import type'
const VALUE_IMPORTS = [
  'writable',
  'readable',
  'derived',
  'get',
  'error',
  'redirect',
  'fail',
  'json',
  'text',
  'onMount',
  'onDestroy',
  'beforeUpdate',
  'afterUpdate',
  'tick',
  'createEventDispatcher',
  'setContext',
  'getContext',
  'hasContext',
  'getAllContexts'
];

async function fixImportTypes() {
  const files = await glob('src/**/*.{ts,js,svelte}', {
    ignore: ['**/node_modules/**', '**/.svelte-kit/**', '**/build/**']
  });

  let fixedCount = 0;
  let errorCount = 0;

  for (const file of files) {
    try {
      let content = readFileSync(file, 'utf-8');
      let modified = false;

      // Fix each value import
      for (const funcName of VALUE_IMPORTS) {
        // Pattern: import type { funcName } from '...'
        const typeImportRegex = new RegExp(
          `import\\s+type\\s*{([^}]*\\b${funcName}\\b[^}]*)}\\s+from\\s+['"]([^'"]+)['"]`,
          'g'
        );

        content = content.replace(typeImportRegex, (match, imports, from) => {
          // Split imports and separate type imports from value imports
          const importList = imports.split(',').map(i => i.trim());
          const valueImports = [];
          const typeImports = [];

          for (const imp of importList) {
            const cleanImp = imp.replace(/\s+/g, ' ').trim();
            if (VALUE_IMPORTS.some(v => cleanImp.includes(v))) {
              valueImports.push(cleanImp);
            } else {
              typeImports.push(cleanImp);
            }
          }

          modified = true;

          // Build replacement
          let replacement = '';
          if (valueImports.length > 0) {
            replacement += `import { ${valueImports.join(', ')} } from '${from}';\n`;
          }
          if (typeImports.length > 0) {
            replacement += `import type { ${typeImports.join(', ')} } from '${from}';`;
          }

          return replacement.trim();
        });
      }

      if (modified) {
        writeFileSync(file, content, 'utf-8');
        fixedCount++;
        console.log(`✅ Fixed: ${file}`);
      }
    } catch (err) {
      errorCount++;
      console.error(`❌ Error processing ${file}:`, err.message);
    }
  }

  console.log(`\n✅ Fixed ${fixedCount} files`);
  if (errorCount > 0) {
    console.log(`❌ Errors in ${errorCount} files`);
  }
}

fixImportTypes().catch(console.error);
