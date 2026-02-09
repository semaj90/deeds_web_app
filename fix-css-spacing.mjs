#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';

const files = [
  'sveltekit-frontend/src/routes/(app)/cases/create/+page.svelte',
  'sveltekit-frontend/src/routes/(app)/codebase-index/+page.svelte',
  'sveltekit-frontend/src/routes/(app)/codebase-index/[fileId]/+page.svelte',
  'sveltekit-frontend/src/routes/(app)/evidence/analyze/+page.svelte',
  'sveltekit-frontend/src/routes/(app)/phase78/monitor/+page.svelte',
  'sveltekit-frontend/src/routes/(app)/phase78/patches/+page.svelte',
  'sveltekit-frontend/src/routes/(app)/phase78/routes/[routePath]/+page.svelte'
];

const fixes = [
  // Fix CSS class spacing errors
  { pattern: /focus:\s+border-([a-z0-9-]+),\s+focus:outline-none/g, replacement: 'focus:border-$1 focus:outline-none' },
  { pattern: /hover:\s+([a-z0-9-]+),/g, replacement: 'hover:$1' },
  { pattern: /md:grid-cols-(\d+),\s+lg:grid-cols-(\d+)/g, replacement: 'md:grid-cols-$1 lg:grid-cols-$2' },
  { pattern: /border-([a-z0-9-]+),\s+hover:bg-/g, replacement: 'border-$1 hover:bg-' },
];

let totalFixed = 0;

for (const file of files) {
  try {
    let content = readFileSync(file, 'utf8');
    let fileFixed = 0;

    for (const { pattern, replacement } of fixes) {
      const before = content;
      content = content.replace(pattern, replacement);
      if (before !== content) {
        fileFixed++;
      }
    }

    if (fileFixed > 0) {
      writeFileSync(file, content, 'utf8');
      console.log(`✅ Fixed ${fileFixed} pattern(s) in ${file.split('/').pop()}`);
      totalFixed += fileFixed;
    }
  } catch (err) {
    console.error(`❌ Error processing ${file}:`, err.message);
  }
}

console.log(`\n🎉 Total: Fixed ${totalFixed} CSS spacing errors across ${files.length} files`);