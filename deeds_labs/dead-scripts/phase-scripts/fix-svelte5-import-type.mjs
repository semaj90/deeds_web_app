#!/usr/bin/env node

/**
 * Svelte 5 Import Type Fixer Codemod
 *
 * Fixes import type { fade } from 'svelte/transition' → import { fade } from 'svelte/transition'
 * for runtime imports that need actual values, not types.
 *
 * Run from repo root:
 * node scripts/fix-svelte5-import-type.mjs "src/routes" "src/lib"
 */

import glob from 'fast-glob';
import fs from 'fs';

const RUNTIME_IMPORTS = new Set([
  // svelte/transition
  'fade', 'blur', 'fly', 'slide', 'scale', 'draw', 'crossfade',

  // svelte/easing
  'backIn', 'backInOut', 'backOut',
  'bounceIn', 'bounceInOut', 'bounceOut',
  'circIn', 'circInOut', 'circOut',
  'cubicIn', 'cubicInOut', 'cubicOut',
  'elasticIn', 'elasticInOut', 'elasticOut',
  'expoIn', 'expoInOut', 'expoOut',
  'linear',
  'quadIn', 'quadInOut', 'quadOut',
  'quartIn', 'quartInOut', 'quartOut',
  'quintIn', 'quintInOut', 'quintOut',
  'sineIn', 'sineInOut', 'sineOut',

  // svelte/animate
  'flip',

  // svelte/motion
  'spring', 'tweened'
]);

async function fixImportTypes(dirs) {
  console.log('🔧 Starting Svelte 5 Import Type Fixer');
  console.log(`📁 Scanning directories: ${dirs.join(', ')}`);

  const files = await glob([
    ...dirs.map(dir => `${dir}/**/*.{svelte,ts,tsx,js,jsx}`),
    '!node_modules/**',
    '!dist/**',
    '!build/**'
  ]);

  let fixedCount = 0;
  const totalFiles = files.length;

  console.log(`📁 Found ${totalFiles} files to check`);

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      let modified = false;
      let newContent = content;

      // Pattern: import type { ... } from 'svelte/...'
      const importTypePattern = /import\s+type\s*\{\s*([^}]+)\s*\}\s+from\s+['"](svelte\/(?:transition|easing|animate|motion))['"]/g;

      newContent = newContent.replace(importTypePattern, (match, imports, module) => {
        const importList = imports.split(',').map(s => s.trim());
        const runtimeImports = [];
        const typeImports = [];

        for (const imp of importList) {
          const cleanImp = imp.replace(/^\s*|\s*$/g, '');
          if (RUNTIME_IMPORTS.has(cleanImp)) {
            runtimeImports.push(cleanImp);
          } else {
            typeImports.push(cleanImp);
          }
        }

        const fixes = [];

        if (runtimeImports.length > 0) {
          fixes.push(`import { ${runtimeImports.join(', ')} } from '${module}'`);
          console.log(`✅ Fixed runtime imports in ${file}: ${runtimeImports.join(', ')}`);
        }

        if (typeImports.length > 0) {
          fixes.push(`import type { ${typeImports.join(', ')} } from '${module}'`);
          console.log(`✅ Kept type imports in ${file}: ${typeImports.join(', ')}`);
        }

        modified = true;
        return fixes.join('\n');
      });

      if (modified) {
        fs.writeFileSync(file, newContent);
        fixedCount++;
      }

    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }

  console.log(`\n🎉 Import Type Fixer Complete!`);
  console.log(`📊 Fixed ${fixedCount} files out of ${totalFiles} total files`);
  console.log(`📈 Success rate: ${((fixedCount / totalFiles) * 100).toFixed(1)}%`);
}

// Get directories from command line args
const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('❌ Usage: node fix-svelte5-import-type.mjs <dir1> <dir2> ...');
  console.error('Example: node fix-svelte5-import-type.mjs "src/routes" "src/lib"');
  process.exit(1);
}

fixImportTypes(dirs).catch(console.error);