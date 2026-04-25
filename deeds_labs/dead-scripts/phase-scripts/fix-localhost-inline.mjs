#!/usr/bin/env node
/**
 * Phase 2: Fix inline hardcoded localhost in fetch() calls and PG host configs.
 * Handles patterns the regex-based const replacement script missed.
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
  let nc = content;
  const helpers = new Set();
  const needsQdrantConst = { value: false };

  // Skip files that are only FASTAPI/GO_MICROSERVICE/PHASE72 localhost refs
  const nonHelperOnly = /localhost|127\.0\.0\.1/g;
  const matches = nc.match(nonHelperOnly);
  if (!matches) { skipped++; continue; }

  // Pattern A: inline fetch('http://localhost:6333/...')  →  fetch(`${QDRANT_URL}/...`)
  nc = nc.replace(
    /fetch\(['"]http:\/\/(?:localhost|127\.0\.0\.1):6333\/([^'"]*)['"]/g,
    (_, path) => {
      helpers.add('getQdrantUrl');
      needsQdrantConst.value = true;
      return 'fetch(`${QDRANT_URL}/' + path + '`';
    }
  );

  // Pattern B: inline fetch('http://127.0.0.1:11434/api/...')  →  fetch(`${OLLAMA_URL}/api/...`)
  nc = nc.replace(
    /fetch\(['"]http:\/\/(?:localhost|127\.0\.0\.1):11434\/([^'"]*)['"]/g,
    (_, path) => {
      helpers.add('getOllamaUrl');
      return 'fetch(`${OLLAMA_URL}/' + path + '`';
    }
  );

  // Pattern C: host: '127.0.0.1' or host: 'localhost' in PG Pool configs
  // Only fix if it's clearly a PG config (has port: 5432 or 5434 nearby)
  if (/host:\s*['"](?:localhost|127\.0\.0\.1)['"]/.test(nc) && /port:\s*(?:5432|5434)/.test(nc)) {
    // Replace the whole PG pool config block with connectionString
    nc = nc.replace(
      /new Pool\(\{[^}]*host:\s*['"](?:localhost|127\.0\.0\.1)['"][^}]*\}\)/gs,
      () => {
        helpers.add('getDatabaseUrl');
        return 'new Pool({ connectionString: getDatabaseUrl() })';
      }
    );
  }

  // Pattern D: qdrantUrl: process.env?.QDRANT_URL ?? 'http://localhost:6333' (in return objects)
  nc = nc.replace(
    /qdrantUrl:\s*process\.env\??\.QDRANT_URL\s*\?\?\s*['"]http:\/\/(?:localhost|127\.0\.0\.1):6333['"]/g,
    () => { helpers.add('getQdrantUrl'); return 'qdrantUrl: getQdrantUrl()'; }
  );

  if (helpers.size > 0 && nc !== content) {
    // Check if file already has env.server import
    const hasEnvImport = nc.includes('env.server');

    // Add QDRANT_URL const if we used it in template literals and file doesn't have one
    if (needsQdrantConst.value && !nc.includes('const QDRANT_URL')) {
      // Add const after imports
      const importEnd = nc.lastIndexOf("import ");
      const lineEnd = nc.indexOf('\n', importEnd);
      const insertPos = nc.indexOf('\n', lineEnd + 1);
      nc = nc.slice(0, insertPos) + '\n\nconst QDRANT_URL = getQdrantUrl();' + nc.slice(insertPos);
    }

    // Add OLLAMA_URL const if needed
    if (helpers.has('getOllamaUrl') && !nc.includes('const OLLAMA_URL') && !nc.includes('const OLLAMA_BASE')) {
      const importEnd = nc.lastIndexOf("import ");
      const lineEnd = nc.indexOf('\n', importEnd);
      const insertPos = nc.indexOf('\n', lineEnd + 1);
      nc = nc.slice(0, insertPos) + '\n\nconst OLLAMA_URL = getOllamaUrl();' + nc.slice(insertPos);
    }

    if (!hasEnvImport) {
      const importLine = `import { ${[...helpers].sort().join(', ')} } from '$lib/config/env.server.js';`;
      const importRegex = /^(import\s+.*;\s*\n)+/m;
      if (importRegex.test(nc)) {
        nc = nc.replace(importRegex, '$&' + importLine + '\n');
      } else {
        nc = importLine + '\n' + nc;
      }
    } else {
      // Merge new helpers into existing import
      for (const h of helpers) {
        if (!nc.includes(h)) {
          nc = nc.replace(
            /import\s*\{([^}]*)\}\s*from\s*['"]\$lib\/config\/env\.server\.js['"]/,
            (match, existing) => {
              const existingHelpers = existing.split(',').map(s => s.trim()).filter(Boolean);
              existingHelpers.push(h);
              return `import { ${existingHelpers.sort().join(', ')} } from '$lib/config/env.server.js'`;
            }
          );
        }
      }
    }

    fs.writeFileSync(file, nc, 'utf8');
    fixed++;
    console.log(`Fixed: ${file} (${[...helpers].join(', ')})`);
  } else {
    skipped++;
  }
}

console.log(`\nTotal: ${files.length} files, Fixed: ${fixed}, Skipped: ${skipped}`);