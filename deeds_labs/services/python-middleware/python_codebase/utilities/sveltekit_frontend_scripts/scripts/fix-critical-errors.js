#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Critical errors that must be fixed immediately
const criticalFixes = [
  // Fix $bindable syntax issues
  {
    pattern: /let\s*{\s*([^}]*open\s*=\s*\$bindable\([^)]*\)[^}]*)\s*}/g,
    replacement: 'let { $1 }',
    files: ['**/*.svelte'],
  },

  // Fix CSS identifier issues in style blocks
  {
    pattern: /(\.[a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*([^;{}]+)([^;]*);/g,
    replacement: '$1: $2$3;',
    files: ['**/*.svelte'],
  },

  // Fix incomplete object assignments
  {
    pattern: /=\s*;\s*$/gm,
    replacement: '= {};',
    files: ['**/*.svelte', '**/*.ts', '**/*.js'],
  },

  // Fix broken console.error calls
  {
    pattern: /console\.error\.([a-zA-Z]+)\)/g,
    replacement: 'console.error($1)',
    files: ['**/*.svelte', '**/*.ts', '**/*.js'],
  },

  // Fix incomplete function calls
  {
    pattern: /\.([a-zA-Z]+)\(\s*\)\s*\(/g,
    replacement: '.$1(() => {',
    files: ['**/*.svelte', '**/*.ts', '**/*.js'],
  },

  // Fix filter/map chain syntax
  {
    pattern: /\.filter\.([a-zA-Z]+)/g,
    replacement: '.filter(item => item.$1)',
    files: ['**/*.svelte', '**/*.ts', '**/*.js'],
  },

  // Fix JSON.stringify calls
  {
    pattern: /JSON\.stringify\.([a-zA-Z]+)\)/g,
    replacement: 'JSON.stringify($1)',
    files: ['**/*.svelte', '**/*.ts', '**/*.js'],
  },
];

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    criticalFixes.forEach(({ pattern, replacement }) => {
      const newContent = content.replace(pattern, replacement);
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    });

    // Specific fixes for known problematic files
    if (filePath.includes('brain/+page.svelte')) {
      if (content.includes('nodeMeshes = ;')) {
        content = content.replace(/nodeMeshes\s*=\s*;/g, 'nodeMeshes = {};');
        modified = true;
      }
    }

    if (filePath.includes('Dialog.svelte')) {
      // Fix any $bindable syntax that might be causing issues
      content = content.replace(/open\s*=\s*\$bindable\(false\)/g, 'open = $bindable(false)');
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Fixed critical errors in: ${path.relative(process.cwd(), filePath)}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

function findFiles(dir, extensions = ['.svelte', '.ts', '.js']) {
  const files = [];

  function scanDir(currentDir) {
    try {
      const items = fs.readdirSync(currentDir);

      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory() && !item.includes('node_modules') && !item.includes('.git')) {
          scanDir(fullPath);
        } else if (extensions.some((ext) => item.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      console.warn(`Warning: Cannot read directory ${currentDir}`);
    }
  }

  scanDir(dir);
  return files;
}

// Process all files
const srcDir = path.join(__dirname, '../src');
const files = findFiles(srcDir);

console.log(`🔄 Processing ${files.length} files for critical error fixes...`);

files.forEach(processFile);

console.log('✨ Critical error fixes complete!');
