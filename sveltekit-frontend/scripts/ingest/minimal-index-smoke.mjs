#!/usr/bin/env node
// Minimal indexer validation harness
// Runs inside sveltekit-frontend using `npx tsx` so TS imports work if needed.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Minimal harness will check exclude rules and perform one direct Qdrant upsert
// with fake vectors to prove the indexer config prevents dev artifacts from
// being upserted. This avoids depending on external embedding services.

async function run() {
  console.log('[minimal-smoke] starting minimal indexer validation');

  const chunks = [
    {
      id: 'normal-source-file-1',
      content: 'export function foo() { return 42; }',
      signature: 'export function foo(): number',
      metadata: { relativePath: 'src/lib/utils/foo.ts', lineStart: 1, lineEnd: 10 }
    },
    {
      id: 'venv-file-1',
      content: 'def irrelevant(): pass',
      signature: 'def irrelevant()',
      metadata: { relativePath: '.venv/Lib/site-packages/somepkg/module.py', lineStart: 1, lineEnd: 10 }
    },
    {
      id: 'site-packages-file-1',
      content: 'class X: pass',
      signature: 'class X',
      metadata: { relativePath: 'venv/lib/site-packages/otherpkg/file.py', lineStart: 1, lineEnd: 8 }
    },
    {
      id: 'pycache-file-1',
      content: '',
      signature: '',
      metadata: { relativePath: 'src/__pycache__/module.cpython-39.pyc', lineStart: 0, lineEnd: 0 }
    }
  ];

  let final = null;
  // Load local indexing config
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const cfgPath = path.resolve(__dirname, '..', '..', 'indexing.config.json');
  let cfg = null;
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    console.log('[minimal-smoke] loaded indexing config from', cfgPath);
  } catch (e) {
    console.warn('[minimal-smoke] no local indexing.config.json found; using defaults');
  }

  const EXCLUDE_PATTERNS = (cfg?.excludePatterns) ?? [
    '.venv/', '/.venv/', '/venv/', 'venv/', 'site-packages/', '__pycache__/',
  ];

  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'); }
  function matchesExclude(lp) {
    const low = lp.toLowerCase();
    for (const patRaw of EXCLUDE_PATTERNS) {
      const pat = patRaw.replace(/\\\\/g, '/').toLowerCase();
      if (pat.includes('*')) {
        const re = new RegExp('^' + pat.split('*').map(escapeRegExp).join('.*') + '$');
        if (re.test(low)) return true;
        continue;
      }
      if (pat.startsWith('**/')) {
        const sub = pat.slice(3);
        if (low.includes(sub)) return true;
        continue;
      }
      if (low.includes(pat) || low.startsWith(pat)) return true;
    }
    return false;
  }

  // Qdrant upsert helper (uses fake vectors)
  function hashToUint(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash);
  }

  const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';

  let skippedIgnored = 0;
  let stored = 0;

  // Perform direct upserts for non-excluded chunks using fake vectors
  const points = [];
  for (const c of chunks) {
    const rel = (c.metadata && c.metadata.relativePath) || '';
    const lp = rel.replace(/\\/g, '/').toLowerCase();
    if (matchesExclude(lp)) {
      skippedIgnored++;
      console.info('[minimal-smoke] skipped ignored path:', rel);
      continue;
    }
    // Prepare fake vectors (768 dims)
    const fake = new Array(768).fill(0.001);
    points.push({ id: hashToUint(c.id), vector: { content: fake, signature: fake }, payload: { content: c.content.slice(0,4000), path: rel } });
  }

  if (points.length > 0) {
    try {
      const res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points }),
      });
      if (!res.ok) {
        console.error('[minimal-smoke] qdrant upsert failed:', await res.text());
      } else {
        stored = points.length;
      }
    } catch (e) {
      console.error('[minimal-smoke] qdrant upsert error:', e?.message ?? e);
    }
  }

  console.log('[minimal-smoke] storedInQdrant=' + stored + ' skippedIgnored=' + skippedIgnored);
  if (stored >= 1 && skippedIgnored >= 3) {
    console.log('[minimal-smoke] SUCCESS: expected 1 upsert and 3 skipped');
    process.exitCode = 0;
  } else {
    console.warn('[minimal-smoke] WARNING: Unexpected counts — review logs');
    process.exitCode = 3;
  }
}

run();
