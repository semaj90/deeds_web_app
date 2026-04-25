#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

console.log('🔧 Fixing TypeScript import errors...');

const projectRoot = process.cwd();
const srcPath = join(projectRoot, 'src');

// Common fixes for import paths
const importFixes = [
  {
    // Remove /index suffix from UI component imports
    pattern: /from\s+['"]\$lib\/components\/ui\/([^'"\/]+)\/index['"]/g,
    replacement: "from '$lib/components/ui/$1'",
  },
  {
    // Remove /index.js/index from imports
    pattern: /from\s+['"]\$lib\/components\/ui\/index\.js\/index['"]/g,
    replacement: "from '$lib/components/ui'",
  },
  {
    // Fix malformed UI imports
    pattern: /from\s+['"]\$lib\/components\/ui\/([^'"]+)\.svelte\/index['"]/g,
    replacement: "from '$lib/components/ui/$1.svelte'",
  },
  {
    // Standardize Button imports
    pattern: /import\s+\{\s*Button\s*\}\s+from\s+['"]\$lib\/components\/ui\/Button\.svelte['"]/g,
    replacement: "import { Button } from '$lib/components/ui'",
  },
  {
    // Fix duplicate imports
    pattern:
      /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]\$lib\/components\/ui['"]\s*;\s*import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]\$lib\/components\/ui['"]/g,
    replacement: "import { $1, $2 } from '$lib/components/ui'",
  },
];

// Function to recursively find all TypeScript and Svelte files
function findFiles(dir, files = []) {
  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      findFiles(fullPath, files);
    } else if (
      stat.isFile() &&
      (item.endsWith('.ts') || item.endsWith('.svelte') || item.endsWith('.js'))
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

// Apply fixes to a file
function fixFile(filePath) {
  try {
    let content = readFileSync(filePath, 'utf8');
    let modified = false;

    for (const fix of importFixes) {
      const originalContent = content;
      content = content.replace(fix.pattern, fix.replacement);
      if (content !== originalContent) {
        modified = true;
      }
    }

    if (modified) {
      writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Fixed: ${filePath.replace(projectRoot, '.')}`);
      return true;
    }
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error.message);
  }

  return false;
}

// Main execution
function main() {
  const files = findFiles(srcPath);
  let fixedCount = 0;

  console.log(`📁 Found ${files.length} files to check`);

  for (const file of files) {
    if (fixFile(file)) {
      fixedCount++;
    }
  }

  console.log(`\n🎉 Fixed ${fixedCount} files with import errors`);

  if (fixedCount > 0) {
    console.log('\n📝 Common fixes applied:');
    console.log('  • Removed /index suffixes from UI imports');
    console.log('  • Fixed malformed import paths');
    console.log('  • Standardized component imports');
    console.log('  • Merged duplicate imports');
  }

  console.log('\n✨ Import fix complete! Run `npm run check` to verify.');
}

main();
