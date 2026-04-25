#!/usr/bin/env node
/**
 * ESM Import Fixer
 *
 * Adds .js extensions to relative imports for ESM compatibility
 * Fixes errors like: "Relative imports need explicit file extensions in ECMAScript imports"
 */

import { readFile, writeFile } from 'fs/promises';
import { glob } from 'glob';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

async function fixFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    let modified = false;

    // Pattern: from './file' or from '../file' (without .js extension)
    const newContent = content.replace(
      /from\s+['"](\.[^'"]+?)(?<!\.js|\.ts|\.svelte|\.json)['"]/g,
      (match, importPath) => {
        modified = true;
        // Add .js extension
        return `from '${importPath}.js'`;
      }
    );

    // Also fix dynamic imports
    const finalContent = newContent.replace(
      /import\s*\(\s*['"](\.[^'"]+?)(?<!\.js|\.ts|\.svelte|\.json)['"]\s*\)/g,
      (match, importPath) => {
        modified = true;
        return `import('${importPath}.js')`;
      }
    );

    if (modified && finalContent !== content) {
      await writeFile(filePath, finalContent, 'utf-8');
      return true;
    }

    return false;
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err.message);
    return false;
  }
}

async function main() {
  console.log('🔧 ESM Import Fixer\n');
  console.log('Scanning for TypeScript and JavaScript files...\n');

  // Find all .ts and .js files (excluding node_modules, .svelte-kit, etc.)
  const files = await glob('src/**/*.{ts,js}', {
    cwd: rootDir,
    ignore: ['**/node_modules/**', '**/.svelte-kit/**', '**/dist/**', '**/build/**'],
    absolute: true
  });

  console.log(`Found ${files.length} files to check\n`);

  let fixedCount = 0;
  let errorCount = 0;

  for (const file of files) {
    const relativePath = file.replace(rootDir + '\\', '');

    try {
      const wasFixed = await fixFile(file);

      if (wasFixed) {
        fixedCount++;
        console.log(`✅ Fixed: ${relativePath}`);
      }
    } catch (err) {
      errorCount++;
      console.error(`❌ Error: ${relativePath} - ${err.message}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Summary:`);
  console.log(`  ✅ Fixed: ${fixedCount} files`);
  console.log(`  ⏭️  Skipped: ${files.length - fixedCount - errorCount} files (no changes needed)`);
  console.log(`  ❌ Errors: ${errorCount} files`);
  console.log(`${'='.repeat(60)}`);

  if (fixedCount > 0) {
    console.log(`\n✨ Run 'npm run check' to verify the fixes`);
  }
}

main().catch(console.error);
