import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const GRAPH_PATH = resolve(ROOT, 'docs/graph/codebase-graph.json');

async function run() {
  const gate = process.argv.find(a => a.startsWith('--gate='))?.split('=')[1];
  
  const raw = await readFile(GRAPH_PATH, 'utf8').catch(() => null);
  if (!raw) {
    console.error('Error: docs/graph/codebase-graph.json not found. Run npm run graphify:map first.');
    process.exit(1);
  }
  
  const graph = JSON.parse(raw);
  const files = Array.isArray(graph) ? graph : (graph.files ?? []);
  
  if (gate === 'G4') {
    console.log('--- G4 Audit: API Routes Missing Auth Guard ---');
    const failing = files.filter(f => f.isRoute && f.rel.startsWith('src/routes/api') && !f.hasAuth && !f.rel.includes('/auth/') && !f.rel.includes('.well-known'));
    failing.forEach(f => {
      console.log(`[FAIL] ${f.rel}`);
    });
    if (failing.length === 0) console.log('All API routes have auth guards. ✅');
    process.exit(failing.length > 0 ? 1 : 0);
  }
  
  if (gate === 'G5') {
    console.log('--- G5 Audit: API Routes Missing Zod Validation ---');
    const failing = files.filter(f => f.isRoute && f.rel.startsWith('src/routes/api') && !f.hasZod && f.parsesBody && !f.rel.includes('/auth/') && !f.rel.includes('.well-known'));
    failing.forEach(f => {
      console.log(`[FAIL] ${f.rel}`);
    });
    if (failing.length === 0) console.log('All API routes have Zod validation. ✅');
    process.exit(failing.length > 0 ? 1 : 0);
  }

  if (gate === 'G15') {
    console.log('--- G15 Audit: SSR-Unsafe Globals (in src/) ---');
    const failing = files.filter(f => f.ssrUnsafe && f.rel.startsWith('src/') && !f.isTest);
    failing.forEach(f => {
      console.log(`[FAIL] ${f.rel}`);
    });
    if (failing.length === 0) console.log('All src/ files are SSR-safe. ✅');
    process.exit(failing.length > 0 ? 1 : 0);
  }

  if (gate === 'G20') {
    console.log('--- G20 Audit: Cyclic Import Pairs ---');
    const cyclicCount = graph.gateStats?.cyclicPairCount ?? 0;
    if (cyclicCount > 0) {
      console.log(`[FAIL] ${cyclicCount} cyclic import pair(s) detected.`);
      process.exit(1);
    } else {
      console.log('No cyclic import pairs detected. ✅');
      process.exit(0);
    }
  }

  console.log('Unknown gate. Use --gate=G4, G5, G15, or G20');
}

run();
