#!/usr/bin/env node
/**
 * Phase 3A: Quick Syntax Fixes
 * Targets: 402 syntax errors (commas, braces, semicolons)
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const fixes = [
  // CSS fixes (35 errors)
  {
    name: 'CSS spacing (focus:, hover:, etc.)',
    pattern: /(focus|hover|active|disabled|checked|group-hover):\s+([a-z-]+)/g,
    replacement: '$1:$2',
    filePattern: /\.svelte$/
  },
  {
    name: 'CSS comma removal (space-separated classes)',
    pattern: /class="([^"]*),\s+([^"]*)"/g,
    replacement: 'class="$1 $2"',
    filePattern: /\.svelte$/
  },
  {
    name: 'CSS grid/flex spacing',
    pattern: /(grid-cols-\d+|gap-\d+),\s+(lg:|md:|sm:)/g,
    replacement: '$1 $2',
    filePattern: /\.svelte$/
  },

  // TypeScript/Svelte syntax fixes (370+ errors)
  {
    name: 'Phantom comma at object start',
    pattern: /\{\s*,\s*([a-zA-Z_$])/g,
    replacement: '{ $1',
    filePattern: /\.(svelte|ts|js)$/
  },
  {
    name: 'Comma before closing brace',
    pattern: /,\s*\}/g,
    replacement: ' }',
    filePattern: /\.(svelte|ts|js)$/
  },
  {
    name: 'Missing comma between object properties',
    pattern: /([a-zA-Z_$][a-zA-Z0-9_$]*:\s*[^,}\n]+)\s+([a-zA-Z_$][a-zA-Z0-9_$]*:)/g,
    replacement: '$1, $2',
    filePattern: /\.(svelte|ts|js)$/
  },
  {
    name: 'Double question marks (corrupted optional)',
    pattern: /\?\?([a-zA-Z_$])/g,
    replacement: '?$1',
    filePattern: /\.(svelte|ts|js)$/
  },
  {
    name: 'Colon instead of comma in generics',
    pattern: /<([A-Z][a-zA-Z0-9_]*):([A-Z][a-zA-Z0-9_]*)>/g,
    replacement: '<$1, $2>',
    filePattern: /\.(svelte|ts|js)$/
  },
  {
    name: 'Missing semicolon in style blocks',
    pattern: /(<style[^>]*>[\s\S]*?)([a-z-]+:\s*[^;}\n]+)(\s*[a-z-]+:)/g,
    replacement: '$1$2;$3',
    filePattern: /\.svelte$/
  }
];

const stats = {
  filesProcessed: 0,
  filesModified: 0,
  totalChanges: 0,
  changesByPattern: {}
};

function processFile(filePath) {
  try {
    const originalContent = readFileSync(filePath, 'utf-8');
    let content = originalContent;
    let fileModified = false;

    for (const fix of fixes) {
      if (!fix.filePattern.test(filePath)) continue;

      const before = content;
      content = content.replace(fix.pattern, fix.replacement);

      if (content !== before) {
        const changes = (before.match(fix.pattern) || []).length;
        stats.changesByPattern[fix.name] = (stats.changesByPattern[fix.name] || 0) + changes;
        stats.totalChanges += changes;
        fileModified = true;
      }
    }

    if (fileModified && content !== originalContent) {
      writeFileSync(filePath, content, 'utf-8');
      stats.filesModified++;
      return true;
    }

    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return false;
  }
}

function processDirectory(dirPath, level = 0) {
  if (level > 10) return; // Prevent infinite recursion

  try {
    const entries = readdirSync(dirPath);

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip node_modules, .git, build, _archive
        if (['node_modules', '.git', 'build', '_archive', '_restoration', 'dist'].includes(entry)) {
          continue;
        }
        processDirectory(fullPath, level + 1);
      } else if (stat.isFile()) {
        if (/\.(svelte|ts|js)$/.test(entry)) {
          stats.filesProcessed++;
          processFile(fullPath);
        }
      }
    }
  } catch (error) {
    // Silently skip directories we can't read
  }
}

console.log('🔧 Phase 3A: Quick Syntax Fixes\n');
console.log('Targeting: 402 syntax errors\n');

const startTime = Date.now();

// Process src directory
console.log('📁 Processing src/...');
processDirectory('src');

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

console.log('\n✅ Phase 3A Complete!\n');
console.log(`📊 Summary:`);
console.log(`   Files processed: ${stats.filesProcessed}`);
console.log(`   Files modified: ${stats.filesModified}`);
console.log(`   Total changes: ${stats.totalChanges}`);
console.log(`   Time: ${elapsed}s\n`);

console.log(`📝 Changes by pattern:`);
for (const [pattern, count] of Object.entries(stats.changesByPattern)) {
  console.log(`   ${pattern}: ${count}`);
}

console.log('\n🎯 Next: Run svelte-check to verify fixes');
console.log('   Command: npm run check');
