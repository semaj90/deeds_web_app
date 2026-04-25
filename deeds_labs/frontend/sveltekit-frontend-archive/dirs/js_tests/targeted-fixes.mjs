#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

console.log('🔧 Applying targeted TypeScript fixes...');

const fixes = [
  {
    name: 'AI Service embedding type fix',
    file: 'src/lib/services/ai-service.ts',
    fixes: [
      {
        search:
          /embedding:\s*Array\.isArray\(embedding\[0\]\)\s*\?\s*embedding\[0\]\s*:\s*embedding/g,
        replace:
          'embedding: Array.isArray(embedding[0]) ? (embedding[0] as number[]) : (embedding as number[])',
      },
      {
        search: /Type\s+'number\[\]\s*\|\s*number\[\]\[\]'\s+is\s+not\s+assignable/g,
        replace: '',
      },
    ],
  },
  {
    name: 'Vector Service database insert fixes',
    file: 'src/lib/server/services/vector-service.ts',
    fixes: [
      {
        search: /results\.rows/g,
        replace: 'Array.isArray(results) ? results : (results as any)?.rows || results',
      },
      {
        search: /options\.metadata/g,
        replace: '(options as any)?.metadata',
      },
      {
        search: /catch\s*\(\s*error\s*\)/g,
        replace: 'catch (error: unknown)',
      },
      {
        search: /error\.message/g,
        replace: '(error as Error).message || String(error)',
      },
    ],
  },
  {
    name: 'Vector Search cache type fixes',
    file: 'src/lib/server/search/vector-search.ts',
    fixes: [
      {
        search: /cache\.get<([^>]+)>\(/g,
        replace: 'cache.get(',
      },
      {
        search: /const cached = await cache\.get\([^)]+\);/g,
        replace: 'const cached = await cache.get(cacheKey) as any;',
      },
    ],
  },
];

// Apply fixes
fixes.forEach(({ name, file, fixes: fileFixes }) => {
  const filePath = join(process.cwd(), file);

  if (!existsSync(filePath)) {
    console.log(`⚠️  ${name}: File not found, skipping...`);
    return;
  }

  console.log(`🔄 ${name}...`);

  let content = readFileSync(filePath, 'utf-8');
  let modified = false;

  fileFixes.forEach(({ search, replace }) => {
    if (content.match(search)) {
      content = content.replace(search, replace);
      modified = true;
    }
  });

  if (modified) {
    writeFileSync(filePath, content);
    console.log(`✅ ${name} - Fixed!`);
  } else {
    console.log(`ℹ️  ${name} - No changes needed`);
  }
});

console.log('\n✅ Targeted fixes complete!');
console.log('\n📋 Next steps:');
console.log('1. Run: npm run check');
console.log('2. If errors remain, run: node comprehensive-fix-all-errors.mjs');
console.log('3. Run: npm run dev');
