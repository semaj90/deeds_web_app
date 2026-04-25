#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';

console.log('🔧 Fixing malformed import paths...');

// Get all TypeScript and JavaScript files
const pattern = 'src/**/*.{ts,js,svelte}';
const files = glob.sync(pattern);

let fixedFiles = 0;
let totalFixes = 0;

for (const file of files) {
  try {
    const content = readFileSync(file, 'utf8');
    let newContent = content;
    let fileFixes = 0;

    // Fix malformed paths with mixed separators and wrong levels
    const malformedPatterns = [
      /from ['"`]\.\.\\\.\.\\\.\.\\\.\.\\\.\.\/\.\./g, // ..\..\..\..\../
      /import\(['"`]\.\.\\\.\.\\\.\.\\\.\.\\\.\.\/\.\./g, // import('..\..\..\..\../
    ];

    // Replace malformed patterns
    for (const pattern of malformedPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        // Count directory levels needed (from api nested routes to src/lib)
        const pathSegments = file.split(/[/\\]/);
        const srcIndex = pathSegments.indexOf('src');
        const routesIndex = pathSegments.indexOf('routes');

        if (srcIndex >= 0 && routesIndex >= 0) {
          // Calculate how many levels up to go from current file to src
          const currentLevel = pathSegments.length - 1; // -1 for filename
          const srcLevel = srcIndex;
          const levelsUp = currentLevel - srcLevel;

          // Create correct relative path
          const upPath = '../'.repeat(levelsUp);

          // Fix the patterns
          newContent = newContent.replace(
            /from ['"`]\.\.\\\.\.\\\.\.\\\.\.\\\.\.\/\.\./g,
            `from '${upPath}`
          );
          newContent = newContent.replace(
            /import\(['"`]\.\.\\\.\.\\\.\.\\\.\.\\\.\.\/\.\./g,
            `import('${upPath}`
          );

          fileFixes += matches.length;
        }
      }
    }

    // Fix any remaining backslashes in import paths
    const backslashPattern = /from ['"`]([^'"`]*\\[^'"`]*?)['"`]/g;
    newContent = newContent.replace(backslashPattern, (match, path) => {
      const fixedPath = path.replace(/\\/g, '/');
      return match.replace(path, fixedPath);
    });

    const importBackslashPattern = /import\(['"`]([^'"`]*\\[^'"`]*?)['"`]\)/g;
    newContent = newContent.replace(importBackslashPattern, (match, path) => {
      const fixedPath = path.replace(/\\/g, '/');
      return match.replace(path, fixedPath);
    });

    // Ensure .js extensions for local imports
    newContent = newContent.replace(/from ['"`](\.\.?[^'"`]*?)['"`]/g, (match, path) => {
      if (
        !path.endsWith('.js') &&
        !path.endsWith('.ts') &&
        !path.endsWith('.svelte') &&
        !path.includes('$')
      ) {
        return match.replace(path, path + '.js');
      }
      return match;
    });

    newContent = newContent.replace(/import\(['"`](\.\.?[^'"`]*?)['"`]\)/g, (match, path) => {
      if (
        !path.endsWith('.js') &&
        !path.endsWith('.ts') &&
        !path.endsWith('.svelte') &&
        !path.includes('$')
      ) {
        return match.replace(path, path + '.js');
      }
      return match;
    });

    if (newContent !== content) {
      writeFileSync(file, newContent, 'utf8');
      fixedFiles++;
      totalFixes += fileFixes;
      console.log(`✅ Fixed ${fileFixes} imports in ${file}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${file}:`, error.message);
  }
}

console.log(`\n🎉 Fixed malformed imports in ${fixedFiles} files (${totalFixes} total fixes)`);
