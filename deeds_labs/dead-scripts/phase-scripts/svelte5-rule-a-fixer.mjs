#!/usr/bin/env node

import glob from 'fast-glob';
import fs from 'fs';

async function fixImportTypeMisuse() {
  console.log('🔧 Starting Rule A: Import-Type Misuse Fixer');

  const files = await glob([
    'src/**/*.{svelte,ts,tsx,js,jsx}',
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

      const transitionImportPattern = /import\s+type\s*\{\s*([^}]+)\s*\}\s+from\s+['"]svelte\/transition['"]/g;

      const newContent = content.replace(transitionImportPattern, (match, imports) => {
        console.log(`✅ Fixed transition import in ${file}: ${match.trim()}`);
        modified = true;
        return `import { ${imports} } from 'svelte/transition'`;
      });

      if (modified) {
        fs.writeFileSync(file, newContent);
        fixedCount++;
      }

    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }

  console.log(`\n🎉 Rule A Complete!`);
  console.log(`📊 Fixed ${fixedCount} files out of ${totalFiles} total files`);
}

fixImportTypeMisuse().catch(console.error);