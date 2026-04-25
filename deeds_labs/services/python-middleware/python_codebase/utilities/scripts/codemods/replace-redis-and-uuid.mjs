#!/usr/bin/env node
/*
  Codemod: replace-redis-and-uuid.mjs
  - Replaces `new Redis(` and `new IORedis(` with importing the shared `redis` from $lib/server/redis-client
  - Replaces `z.string().uuid()` with `cuidSchema` import from $lib/server/z-schemas
  - Creates a .bak copy before modifying each file
  Usage: node scripts/codemods/replace-redis-and-uuid.mjs <path>
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

  // Replace new Redis(...) and new IORedis(...)
  src = src.replace(/new\s+IORedis\s*\([^;\n]*\)/g, "redis");
  src = src.replace(/new\s+Redis\s*\([^;\n]*\)/g, "redis");

  // Replace z.string().uuid() with cuidSchema
  src = src.replace(/z\.string\(\)\.uuid\(\)/g, 'cuidSchema');

  // Add imports if necessary
  if (src !== orig) {
    let updated = src;
    if (/\bredis\b/.test(src) && !/from '\$lib\/server\/redis-client'/.test(src)) {
      updated = "import { redis } from '$lib/server/redis-client';\n" + updated;
    }
    if (/\bcuidSchema\b/.test(src) && !/from '\$lib\/server\/z-schemas'/.test(src)) {
      updated = "import { cuidSchema } from '$lib/server/z-schemas';\n" + updated;
    }

    fs.writeFileSync(file + '.bak', orig, 'utf8');
    fs.writeFileSync(file, updated, 'utf8');
    changed++;
    console.log('patched:', file);
  }
});

console.log(`Codemod complete. Files changed: ${changed}`);
