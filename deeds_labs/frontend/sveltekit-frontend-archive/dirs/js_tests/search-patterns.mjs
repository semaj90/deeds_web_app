#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.join(__dirname, 'src');

function findFiles(dir, extensions = ['.svelte', '.ts', '.js']) {
  const files = [];

  function traverse(currentDir) {
    try {
      const items = fs.readdirSync(currentDir);
      for (const item of items) {
        if (item.startsWith('.') || item === 'node_modules') continue;

        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          traverse(fullPath);
        } else if (extensions.some((ext) => item.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(`Could not traverse directory: ${currentDir}`);
    }
  }

  traverse(dir);
  return files;
}

function searchPatterns() {
  console.log('🔍 Searching for remaining problematic patterns...\n');

  const files = findFiles(SRC_DIR);
  const patterns = {
    'tabindex="': {
      files: [],
      description: 'String tabindex (should be number)',
    },
    'Button.*href': {
      files: [],
      description: 'Button with href (use <a> tag)',
    },
    'size="': { files: [], description: 'String size prop (check type)' },
    'export let.*: string': {
      files: [],
      description: 'Generic string props (use unions)',
    },
    '<canvas.*/>': { files: [], description: 'Self-closing canvas tag' },
    '<textarea.*/>': { files: [], description: 'Self-closing textarea tag' },
    'disabled="true"': { files: [], description: 'String boolean prop' },
    'from "fuse"': { files: [], description: 'Incorrect fuse import' },
    'window.location.href': {
      files: [],
      description: 'Direct navigation (use goto)',
    },
  };

  let totalIssues = 0;

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const relativePath = path.relative(SRC_DIR, file);

      // Check each pattern
      if (content.includes('tabindex="')) {
        patterns['tabindex="'].files.push(relativePath);
        totalIssues++;
      }

      if (content.includes('Button') && content.includes('href')) {
        patterns['Button.*href'].files.push(relativePath);
        totalIssues++;
      }

      if (content.includes('size="')) {
        patterns['size="'].files.push(relativePath);
        totalIssues++;
      }

      if (content.includes('export let') && content.includes(': string')) {
        patterns['export let.*: string'].files.push(relativePath);
        totalIssues++;
      }

      if (content.match(/<canvas[^>]*\/>/)) {
        patterns['<canvas.*/>'].files.push(relativePath);
        totalIssues++;
      }

      if (content.match(/<textarea[^>]*\/>/)) {
        patterns['<textarea.*/>'].files.push(relativePath);
        totalIssues++;
      }

      if (content.includes('disabled="true"') || content.includes('disabled="false"')) {
        patterns['disabled="true"'].files.push(relativePath);
        totalIssues++;
      }

      if (content.includes('from "fuse"')) {
        patterns['from "fuse"'].files.push(relativePath);
        totalIssues++;
      }

      if (content.includes('window.location.href')) {
        patterns['window.location.href'].files.push(relativePath);
        totalIssues++;
      }
    } catch (error) {
      // Skip files that can't be read
    }
  }

  // Report findings
  console.log(`📊 PATTERN SEARCH RESULTS (${totalIssues} issues found)\n`);

  for (const [pattern, data] of Object.entries(patterns)) {
    if (data.files.length > 0) {
      console.log(`🔴 "${pattern}" - ${data.description}`);
      console.log(`   Found in ${data.files.length} files:`);
      data.files.slice(0, 3).forEach((file) => console.log(`   • ${file}`));
      if (data.files.length > 3) {
        console.log(`   • ... and ${data.files.length - 3} more`);
      }
      console.log();
    } else {
      console.log(`✅ "${pattern}" - ${data.description}: CLEAN`);
    }
  }

  // Priority recommendations
  console.log('\n🎯 PRIORITY FIX ORDER:');
  const priorityOrder = [
    'tabindex="',
    'export let.*: string',
    'Button.*href',
    '<canvas.*/>',
    'disabled="true"',
  ];

  priorityOrder.forEach((pattern, index) => {
    const count = patterns[pattern]?.files.length || 0;
    if (count > 0) {
      console.log(`${index + 1}. Fix "${pattern}" (${count} files) - Use Find in Files`);
    }
  });

  if (totalIssues === 0) {
    console.log('\n🎉 NO PROBLEMATIC PATTERNS FOUND!');
    console.log('All major SvelteKit issues appear to be resolved.');
    console.log('Run "npm run check" to see remaining TypeScript errors.');
  } else {
    console.log(`\n📋 Total pattern issues: ${totalIssues}`);
    console.log('Use Find in Files in your editor to locate and fix these patterns.');
  }
}

// Execute
searchPatterns();
