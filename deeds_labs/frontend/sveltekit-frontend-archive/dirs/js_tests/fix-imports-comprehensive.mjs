#!/usr/bin/env node

import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, relative, dirname } from 'path';

const SRC_DIR = 'src';
const excludeDirs = ['.svelte-kit', 'node_modules', '.git'];
const includeExtensions = ['.ts', '.js', '.svelte'];

function calculateLibPath(fromFile) {
  const relativePath = relative(dirname(fromFile), SRC_DIR);
  return relativePath || '.';
}

function convertLibImport(importStatement, fromFile) {
  const libPath = calculateLibPath(fromFile);

  // Replace $lib with the calculated relative path
  return importStatement.replace(/\$lib/g, `${libPath}/lib`);
}

async function processFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    let modified = false;
    let newContent = content;

    // Pattern for all $lib imports (static and dynamic)
    const patterns = [
      // Standard imports: import ... from '$lib/...'
      {
        regex: /import\s+([^;]*?)\s+from\s+['"`](\$lib[^'"`]*?)['"`];?/g,
        type: 'static',
      },
      // Dynamic imports: import('$lib/...')
      {
        regex: /import\s*\(\s*['"`](\$lib[^'"`]*?)['"`]\s*\)/g,
        type: 'dynamic',
      },
      // await import('$lib/...')
      {
        regex: /await\s+import\s*\(\s*['"`](\$lib[^'"`]*?)['"`]\s*\)/g,
        type: 'await',
      },
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        if (pattern.type === 'static') {
          const fullMatch = match[0];
          const importClause = match[1];
          const importPath = match[2];

          if (importPath.startsWith('$lib')) {
            const relativePath = calculateLibPath(filePath);
            const newImportPath = importPath.replace('$lib', `${relativePath}/lib`);
            const newImport = fullMatch.replace(importPath, newImportPath);
            newContent = newContent.replace(fullMatch, newImport);
            modified = true;
          }
        } else {
          const fullMatch = match[0];
          const importPath = match[1];

          if (importPath.startsWith('$lib')) {
            const relativePath = calculateLibPath(filePath);
            const newImportPath = importPath.replace('$lib', `${relativePath}/lib`);
            const newImport = fullMatch.replace(importPath, newImportPath);
            newContent = newContent.replace(fullMatch, newImport);
            modified = true;
          }
        }
      }
      pattern.regex.lastIndex = 0; // Reset regex
    });

    if (modified) {
      await writeFile(filePath, newContent, 'utf-8');
      console.log(`✅ Fixed: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

async function processDirectory(dirPath) {
  const entries = await readdir(dirPath);
  let totalFixed = 0;

  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const stats = await stat(fullPath);

    if (stats.isDirectory()) {
      if (!excludeDirs.includes(entry)) {
        totalFixed += await processDirectory(fullPath);
      }
    } else if (stats.isFile()) {
      const ext = entry.substring(entry.lastIndexOf('.'));
      if (includeExtensions.includes(ext)) {
        const fixed = await processFile(fullPath);
        if (fixed) totalFixed++;
      }
    }
  }

  return totalFixed;
}

async function main() {
  console.log('🔧 Starting comprehensive $lib import fix...');

  try {
    const totalFixed = await processDirectory(SRC_DIR);
    console.log(`\n✨ Fixed ${totalFixed} files with $lib imports`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
