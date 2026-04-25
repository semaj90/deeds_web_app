#!/usr/bin/env node
/**
 * Emergency fix: Remove $state runes from server-side TypeScript files
 * Runes only work in .svelte and .svelte.js/ts files
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Files to fix
const serverFiles = [
  'src/lib/server/cache.ts',
  'src/lib/server/database-pool-service.ts',
  'src/lib/server/http-cache-headers.ts',
  'src/lib/server/lokiHybridStore.ts',
  'src/lib/server/redis-client.ts',
  'src/lib/server/redis-service.ts',
  'src/lib/server/shutdown.ts',
  'src/lib/server/simd-body-parser.ts',
  'src/lib/server/tensor-acceleration.ts',
  'src/lib/server/thread-safe-postgres.ts',
  'src/lib/server/webgpu-langchain-bridge.ts'
];

let totalFixed = 0;

for (const relPath of serverFiles) {
  const filePath = path.join(rootDir, relPath);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⏭️  Skipping ${relPath} (not found)`);
    continue;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Pattern 1: $state(value) → value
  const statePattern = /\$state\(([^)]+)\)/g;
  if (statePattern.test(content)) {
    content = content.replace(statePattern, '$1');
    modified = true;
  }
  
  // Pattern 2: $derived(value) → value
  const derivedPattern = /\$derived\(([^)]+)\)/g;
  if (derivedPattern.test(content)) {
    content = content.replace(derivedPattern, '$1');
    modified = true;
  }
  
  // Pattern 3: $effect(() => {...}) → // Server-side effect removed
  const effectPattern = /\$effect\([^)]*\)/g;
  if (effectPattern.test(content)) {
    content = content.replace(effectPattern, '/* $effect removed - server-side */');
    modified = true;
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Fixed ${relPath}`);
    totalFixed++;
  } else {
    console.log(`⏭️  No changes needed: ${relPath}`);
  }
}

console.log(`\n🎉 Fixed ${totalFixed} server files`);
