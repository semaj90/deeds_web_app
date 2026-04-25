#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Common CSS identifier fixes
const CSS_FIXES = [
  // Fix TypeScript-like CSS selectors
  { from: /\.([\w-]+)\s*\([^)]*\)\s*\.([\w-]+)/g, to: '.$1.$2' },
  { from: /\.([\w-]+)\s*as\s*\{[^}]*\}\s*\.([\w-]+)/g, to: '.$1.$2' },

  // Fix invalid CSS identifiers
  {
    from: /\.evidence-\(item\s+as\s+\{[^}]*\}\)\.(active|pending|selected)/g,
    to: '.evidence-item.$1',
  },
  { from: /\.card-\(variant\s+as\s+\{[^}]*\}\)\.(primary|secondary|outline)/g, to: '.card-$1' },
  { from: /\.button-\(size\s+as\s+\{[^}]*\}\)\.(sm|md|lg)/g, to: '.button-$1' },

  // Fix common Svelte 4 to 5 CSS issues
  { from: /\.([\w-]+)\s*\(\s*\$\$restProps\s*\)/g, to: '.$1' },
  { from: /\.([\w-]+)\s*\(\s*\$\$props\s*\)/g, to: '.$1' },

  // Fix function-like CSS selectors
  { from: /\.(\w+)\(\s*([^)]+)\s*\)\.(\w+)/g, to: '.$1-$3' },

  // Clean up empty CSS rules
  { from: /\s*{\s*}\s*/g, to: ' ' },

  // Fix CSS variables with invalid syntax
  { from: /var\(\s*--(\w+)-\(\w+\)\s*\)/g, to: 'var(--$1)' },
];

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    CSS_FIXES.forEach(({ from, to }) => {
      const newContent = content.replace(from, to);
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    });

    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Fixed CSS in: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

function findSvelteFiles(dir) {
  const files = [];

  function scanDir(currentDir) {
    try {
      const items = fs.readdirSync(currentDir);

      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory() && !item.includes('node_modules') && !item.includes('.git')) {
          scanDir(fullPath);
        } else if (item.endsWith('.svelte') || item.endsWith('.css') || item.endsWith('.scss')) {
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
const files = findSvelteFiles(srcDir);

console.log(`🔄 Processing ${files.length} files for CSS identifier fixes...`);

files.forEach(processFile);

console.log('✨ CSS identifier fixes complete!');
