#!/usr/bin/env node
/**
 * Batch-fix hardcoded localhost URLs in route files.
 * Replaces with env.server.js helpers (getOllamaUrl, getQdrantUrl, etc.)
 */
import fs from 'fs';
import { execSync } from 'child_process';

const files = execSync(
  'rg -l "(localhost|127\\.0\\.0\\.1)" src/routes/ -g "*+server.ts" -g "*+page.server.ts" 2>/dev/null',
  { encoding: 'utf8', cwd: process.cwd() }
).trim().split('\n').filter(Boolean);

let fixed = 0, skipped = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('env.server')) { skipped++; continue; }

  let nc = content;
  const helpers = new Set();

  // Qdrant const assignments
  nc = nc.replace(
    /const\s+(\w+)\s*=\s*(?:process\.env\??\.QDRANT_URL\s*\?\?\s*)?['"]http:\/\/(?:localhost|127\.0\.0\.1):6333['"];?/g,
    (_, name) => { helpers.add('getQdrantUrl'); return `const ${name} = getQdrantUrl();`; }
  );

  // Qdrant in object literals: url: process.env?.QDRANT_URL ?? '...'
  nc = nc.replace(
    /url:\s*process\.env\??\.QDRANT_URL\s*\?\?\s*['"]http:\/\/(?:localhost|127\.0\.0\.1):6333['"]/g,
    () => { helpers.add('getQdrantUrl'); return 'url: getQdrantUrl()'; }
  );

  // QdrantClient({ url: '...' })
  nc = nc.replace(
    /QdrantClient\(\{\s*url:\s*['"]http:\/\/(?:localhost|127\.0\.0\.1):6333['"]\s*\}\)/g,
    () => { helpers.add('getQdrantUrl'); return 'QdrantClient({ url: getQdrantUrl() })'; }
  );

  // Ollama const assignments
  nc = nc.replace(
    /const\s+(\w+)\s*=\s*(?:process\.env\??\.OLLAMA_URL\s*(?:\?\?|\|\|)\s*)?['"]http:\/\/(?:localhost|127\.0\.0\.1):11434['"];?/g,
    (_, name) => { helpers.add('getOllamaUrl'); return `const ${name} = getOllamaUrl();`; }
  );

  // Database const assignments
  nc = nc.replace(
    /const\s+(\w+)\s*=\s*(?:process\.env\??\.DATABASE_URL\s*\?\?\s*)?['"]postgresql:\/\/[^'"]*(?:localhost|127\.0\.0\.1)[^'"]*['"];?/g,
    (_, name) => { helpers.add('getDatabaseUrl'); return `const ${name} = getDatabaseUrl();`; }
  );

  // postgres(process.env?.DATABASE_URL ?? 'postgresql://...')
  nc = nc.replace(
    /postgres\(process\.env\??\.DATABASE_URL\s*\?\?\s*['"]postgresql:\/\/[^'"]*(?:localhost|127\.0\.0\.1)[^'"]*['"]\)/g,
    () => { helpers.add('getDatabaseUrl'); return 'postgres(getDatabaseUrl())'; }
  );

  // Redis const assignments
  nc = nc.replace(
    /const\s+(\w+)\s*=\s*(?:process\.env\??\.REDIS_URL\s*\?\?\s*)?['"]redis:\/\/(?:localhost|127\.0\.0\.1)[^'"]*['"];?/g,
    (_, name) => { helpers.add('getRedisUrl'); return `const ${name} = getRedisUrl();`; }
  );

  // Redis in object literals: url: process.env?.REDIS_URL ?? '...'
  nc = nc.replace(
    /url:\s*process\.env\??\.REDIS_URL\s*\?\?\s*['"]redis:\/\/(?:localhost|127\.0\.0\.1)[^'"]*['"]/g,
    () => { helpers.add('getRedisUrl'); return 'url: getRedisUrl()'; }
  );

  if (helpers.size > 0 && nc !== content) {
    // Add import after existing imports
    const importLine = `import { ${[...helpers].sort().join(', ')} } from '$lib/config/env.server.js';`;
    const importRegex = /^(import\s+.*;\s*\n)+/m;
    if (importRegex.test(nc)) {
      nc = nc.replace(importRegex, '$&' + importLine + '\n');
    } else {
      nc = importLine + '\n' + nc;
    }
    fs.writeFileSync(file, nc, 'utf8');
    fixed++;
    console.log(`Fixed: ${file} (${[...helpers].join(', ')})`);
  } else {
    skipped++;
  }
}

console.log(`\nTotal: ${files.length} files, Fixed: ${fixed}, Skipped: ${skipped}`);