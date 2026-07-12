#!/usr/bin/env node

/**
 * T1-2: Qdrant Singleton Pooling — Apply Transformation
 *
 * Replaces all `new QdrantClient()` and `new QdrantManager()` instantiations
 * with the singleton getter from qdrant-singleton.ts.
 *
 * Usage:
 *   node scripts/t1-2-qdrant-singleton-apply.mjs [--dry-run] [--limit 5]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit'));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 999;

const patterns = [
  'sveltekit-frontend/src/routes/**/*.ts',
  'sveltekit-frontend/src/lib/server/**/*.ts',
];

const files = [];
for (const pattern of patterns) {
  const matches = globSync(path.join(repoRoot, pattern), { nodir: true });
  files.push(...matches);
}

// Filter to files that import QdrantClient/QdrantManager directly
const relevantFiles = files.filter(file => {
  const content = fs.readFileSync(file, 'utf-8');
  return /new QdrantClient|new QdrantManager/.test(content);
});

console.log(`✓ Found ${relevantFiles.length} files with Qdrant instantiations`);

let applied = 0;

for (const file of relevantFiles.slice(0, limit)) {
  let content = fs.readFileSync(file, 'utf-8');
  const original = content;

  // Pattern 1: const qdrant = new QdrantClient({ url: ENV.QDRANT_URL })
  content = content.replace(
    /const\s+(\w+)\s*=\s*new QdrantClient\s*\(\s*\{\s*url:\s*ENV\.QDRANT_URL\s*(?:,\s*)?.*?\}\s*\)/g,
    (match, varName) => {
      console.log(`  → Replace: const ${varName} = new QdrantClient({ url: ENV.QDRANT_URL, ... })`);
      return `const ${varName} = getQdrantClient()`;
    }
  );

  // Pattern 2: const qdrant = new QdrantClient({ url: ... }) with any getQdrantUrl() pattern
  content = content.replace(
    /const\s+(\w+)\s*=\s*new QdrantClient\s*\(\s*\{\s*url:\s*(?:getQdrantUrl\(\)|ENV\.QDRANT_URL|.*?Qdrant.*?)\s*(?:,\s*)?.*?\}\s*\)/g,
    (match, varName) => {
      console.log(`  → Replace: const ${varName} = new QdrantClient(...)`);
      return `const ${varName} = getQdrantClient()`;
    }
  );

  // Pattern 3: const qdrant = new QdrantManager()
  content = content.replace(
    /const\s+(\w+)\s*=\s*new QdrantManager\s*\(\s*\)/g,
    (match, varName) => {
      console.log(`  → Replace: const ${varName} = new QdrantManager()`);
      return `const ${varName} = getQdrantClient()`;
    }
  );

  // Pattern 4: qdrant = new QdrantClient(...) (assignment without const)
  content = content.replace(
    /(\w+)\s*=\s*new QdrantClient\s*\(\s*\{\s*url:\s*.*?\}\s*\)/g,
    (match, varName) => {
      console.log(`  → Replace: ${varName} = new QdrantClient(...)`);
      return `${varName} = getQdrantClient()`;
    }
  );

  // Add import if the file was modified and doesn't already have it
  if (content !== original && !content.includes("from '$lib/server/vector/qdrant-singleton")) {
    // Find the insertion point (after last import)
    const importMatch = content.match(/^import\s+.*?['"];[\s\n]*/m);
    if (importMatch) {
      const lastImportEnd = content.lastIndexOf("from '") + content.slice(content.lastIndexOf("from '")).indexOf("';") + 2;
      content = content.slice(0, lastImportEnd) + "\nimport { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';" + content.slice(lastImportEnd);
    }
  }

  if (content !== original) {
    applied++;
    if (dryRun) {
      console.log(`[DRY-RUN] Would update: ${path.relative(repoRoot, file)}`);
    } else {
      fs.writeFileSync(file, content, 'utf-8');
      console.log(`✓ Updated: ${path.relative(repoRoot, file)}`);
    }
  }
}

console.log(`\n✓ Processed ${Math.min(limit, relevantFiles.length)} files, applied ${applied} transformations${dryRun ? ' (dry-run)' : ''}`);
console.log(`\nNext steps:`);
console.log(`  1. Run: npm run check (verify no type errors)`);
console.log(`  2. Run: npm run test (verify functionality)`);
console.log(`  3. Monitor Qdrant connection pool via /api/health`);
