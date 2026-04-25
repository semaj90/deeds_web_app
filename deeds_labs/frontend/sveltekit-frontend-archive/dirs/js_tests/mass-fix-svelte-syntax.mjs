#!/usr/bin/env node

import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Comprehensive fix for className and tabindex issues across all Svelte files
const globalFixes = [
  // Fix className="${1}" -> class="placeholder"
  {
    pattern: /className="\$\{1\}"/g,
    replacement: 'class="placeholder"',
    description: 'Fix invalid className template literals',
  },

  // Fix className="classname" (different variations)
  {
    pattern: /className="classname"/g,
    replacement: 'class="placeholder"',
    description: 'Fix className="classname" to class',
  },

  // Fix any remaining className= to class=
  {
    pattern: /className=/g,
    replacement: 'class=',
    description: 'Fix React className to Svelte class',
  },

  // Fix tabindex={${1}} -> tabindex="0"
  {
    pattern: /tabindex=\{\$\{1\}\}/g,
    replacement: 'tabindex="0"',
    description: 'Fix invalid tabindex template literals',
  },

  // Fix role="dialog" without tabindex
  {
    pattern: /(<[^>]*role="dialog"[^>]*)(>)/g,
    replacement: (match, p1, p2) => {
      if (!p1.includes('tabindex')) {
        return p1 + ' tabindex="-1"' + p2;
      }
      return match;
    },
    description: 'Add tabindex to dialog elements',
  },

  // Fix other invalid template literals in attributes
  {
    pattern: /="?\$\{1\}"?/g,
    replacement: '="placeholder"',
    description: 'Fix other invalid template literals',
  },
];

// Semantic class name mappings for common elements
const semanticMappings = {
  button: 'btn',
  div: 'container',
  span: 'text',
  input: 'input-field',
  form: 'form',
  header: 'header',
  footer: 'footer',
  main: 'main-content',
  nav: 'navigation',
  section: 'section',
  article: 'article',
  aside: 'sidebar',
  ul: 'list',
  li: 'list-item',
  table: 'table',
  thead: 'table-header',
  tbody: 'table-body',
  tr: 'table-row',
  td: 'table-cell',
  th: 'table-header-cell',
};

async function findSvelteFiles(dir) {
  const files = [];

  async function traverse(currentDir) {
    try {
      const items = await fs.readdir(currentDir, { withFileTypes: true });

      for (const item of items) {
        const fullPath = join(currentDir, item.name);

        if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
          await traverse(fullPath);
        } else if (item.isFile() && item.name.endsWith('.svelte')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not read directory ${currentDir}: ${error.message}`);
    }
  }

  await traverse(dir);
  return files;
}

async function fixSvelteFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    const originalContent = content;
    let changes = 0;

    // Apply global fixes
    for (const fix of globalFixes) {
      const beforeLength = content.length;
      if (typeof fix.replacement === 'function') {
        content = content.replace(fix.pattern, fix.replacement);
      } else {
        content = content.replace(fix.pattern, fix.replacement);
      }
      const afterLength = content.length;
      if (beforeLength !== afterLength) {
        changes++;
      }
    }

    // Apply semantic improvements for class="placeholder"
    content = content.replace(/class="placeholder"/g, (match, offset) => {
      // Try to determine context from surrounding HTML
      const beforeMatch = content.substring(Math.max(0, offset - 100), offset);
      const tagMatch = beforeMatch.match(/<(\w+)[^>]*$/);

      if (tagMatch) {
        const tagName = tagMatch[1].toLowerCase();
        const semanticClass = semanticMappings[tagName] || 'element';
        return `class="${semanticClass}"`;
      }

      return 'class="element"';
    });

    if (content !== originalContent) {
      await fs.writeFile(filePath, content, 'utf8');
      return changes;
    }

    return 0;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return 0;
  }
}

async function fixAllSvelteFiles() {
  const startTime = Date.now();
  console.log('🔍 Finding all Svelte files...');

  const svelteFiles = await findSvelteFiles('./src');
  console.log(`📁 Found ${svelteFiles.length} Svelte files`);

  console.log('🔧 Fixing syntax errors...');

  let totalChanges = 0;
  let filesModified = 0;
  const results = [];

  for (const file of svelteFiles) {
    const changes = await fixSvelteFile(file);
    if (changes > 0) {
      filesModified++;
      totalChanges += changes;
      results.push({ file, changes });
      console.log(`✓ Fixed ${file} (${changes} changes)`);
    }
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log(`\n🎉 Mass Svelte fixes completed in ${duration}s!`);
  console.log(`📊 Summary:`);
  console.log(`   • Files processed: ${svelteFiles.length}`);
  console.log(`   • Files modified: ${filesModified}`);
  console.log(`   • Total changes: ${totalChanges}`);

  if (results.length > 0) {
    console.log(`\n📋 Modified files:`);
    results.slice(0, 20).forEach(({ file, changes }) => {
      const relativePath = file.replace(process.cwd(), '.');
      console.log(`   • ${relativePath}: ${changes} changes`);
    });

    if (results.length > 20) {
      console.log(`   ... and ${results.length - 20} more files`);
    }
  }

  return { filesModified, totalChanges, duration };
}

// Run the mass fix
fixAllSvelteFiles()
  .then((result) => {
    console.log(`\n✅ Mass fix completed successfully!`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Mass fix failed:', error);
    process.exit(1);
  });
