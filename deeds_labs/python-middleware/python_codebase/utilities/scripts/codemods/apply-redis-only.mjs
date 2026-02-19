#!/usr/bin/env node
/*
  apply-redis-only.mjs
  - Replaces `new Redis(`, `new IORedis(`, and `createClient(` with the shared `redis` import
  - Adds `import { redis, ensureRedisReady } from '$lib/server/redis-client';` when needed
  - Creates .bak backups
  Usage: node apply-redis-only.mjs <path>
*/

import fs from 'fs';
import path from 'path';

function walk(dir, cb) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entr of entries) {
    const full = path.join(dir, entr.name);
    if (entr.isDirectory()) {
      if (entr.name === 'node_modules' || entr.name === '.git') continue;
      walk(full, cb);
    } else {
      cb(full);
    }
  }
}

const root = process.argv[2] || process.cwd();
let changed = 0;

walk(root, file => {
  if (!file.endsWith('.ts') && !file.endsWith('.js') && !file.endsWith('.svelte')) return;
  let src = fs.readFileSync(file, 'utf8');
  const orig = src;

  // Replace patterns for Redis constructors and createClient
  src = src.replace(/new\s+IORedis\s*\([^;\n]*\)/g, 'redis');
  src = src.replace(/new\s+Redis\s*\([^;\n]*\)/g, 'redis');
  src = src.replace(/createClient\s*\([^;\n]*\)/g, 'redis');

  if (src !== orig) {
    let updated = src;
    if (/\bredis\b/.test(src) && !/from '\$lib\/server\/redis-client'/.test(src)) {
      updated = "import { redis, ensureRedisReady } from '$lib/server/redis-client';\n" + updated;
    }

    fs.writeFileSync(file + '.bak', orig, 'utf8');
    fs.writeFileSync(file, updated, 'utf8');
    changed++;
    console.log('patched:', file);
  }
});

console.log(`Redis-only codemod complete. Files changed: ${changed}`);
