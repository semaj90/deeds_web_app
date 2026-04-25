#!/usr/bin/env node
/**
 * Replace Minified API Server Files with Valid Stubs
 * These files are all on 1 line and contain syntax errors
 * Creating proper stub implementations to allow compilation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.join(__dirname, '..');

// List of minified API files to stub out
const MINIFIED_API_FILES = [
  'src/routes/api/ai/summarize/stream/+server.ts',
  'src/routes/api/ai/upload/+server.ts',
  'src/routes/api/auth/debug/+server.ts',
  'src/routes/api/auth/demo-login/+server.ts',
  'src/routes/api/bench/json/+server.ts',
  'src/routes/api/bench/simd/hot/+server.ts',
  'src/routes/api/bench/simd/load/+server.ts',
  'src/routes/api/bench/simd/metrics/+server.ts',
  'src/routes/api/bench/simd/toggle/+server.ts',
  'src/routes/api/bits-ui/data/+server.ts',
  'src/routes/api/brain/graph/+server.ts',
  'src/routes/api/cache/redis/get-recent/+server.ts',
  'src/routes/api/cases/suggest-title/+server.ts',
  'src/routes/api/debug/session/+server.ts',
  'src/routes/api/dev-auth/diagnostics/+server.ts',
  'src/routes/api/document/[id]/+server.ts',
  'src/routes/api/evidence-canvas/save/+server.ts',
  'src/routes/api/evidence/[caseId]_disabled/+server.ts',
  'src/routes/api/evidence/DEPRECATED.+server.ts',
  'src/routes/api/evidence/upload-simple/+server.ts',
  'src/routes/api/gpu-error-processor/+server.ts'
  // Add more as needed - focusing on the top ones causing failures
];

const STUB_TEMPLATE = (routePath) => `import type { RequestHandler } from './$types.js';

/**
 * Stub implementation for: ${routePath}
 *
 * This file was minified and contained syntax errors.
 * Replaced with a working stub to allow compilation.
 *
 * Original purpose: ${getRouteDescription(routePath)}
 *
 * TODO: Restore from backup or reimplement with proper TypeScript
 */

export const GET: RequestHandler = async (event) => {
  return new Response(
    JSON.stringify({
      status: 'stub',
      message: 'This endpoint is not yet fully implemented',
      route: '${routePath}'
    }),
    {
      status: 501,
      headers: { 'Content-Type': 'application/json' }
    }
  );
};

export const POST: RequestHandler = async (event) => {
  return new Response(
    JSON.stringify({
      status: 'stub',
      message: 'This endpoint is not yet fully implemented',
      route: '${routePath}'
    }),
    {
      status: 501,
      headers: { 'Content-Type': 'application/json' }
    }
  );
};

export const PUT: RequestHandler = async (event) => {
  return new Response(
    JSON.stringify({
      status: 'stub',
      message: 'This endpoint is not yet fully implemented',
      route: '${routePath}'
    }),
    {
      status: 501,
      headers: { 'Content-Type': 'application/json' }
    }
  );
};

export const DELETE: RequestHandler = async (event) => {
  return new Response(
    JSON.stringify({
      status: 'stub',
      message: 'This endpoint is not yet fully implemented',
      route: '${routePath}'
    }),
    {
      status: 501,
      headers: { 'Content-Type': 'application/json' }
    }
  );
};
`;

function getRouteDescription(routePath) {
  const route = routePath.toLowerCase();
  if (route.includes('summarize')) return 'AI text summarization stream endpoint';
  if (route.includes('upload')) return 'File upload handler';
  if (route.includes('auth')) return 'Authentication endpoint';
  if (route.includes('bench')) return 'Benchmark endpoint';
  if (route.includes('data')) return 'Data API endpoint';
  if (route.includes('graph')) return 'Graph/neural network endpoint';
  if (route.includes('cache')) return 'Cache/Redis endpoint';
  if (route.includes('evidence')) return 'Evidence management endpoint';
  if (route.includes('document')) return 'Document management endpoint';
  return 'API endpoint';
}

function isFileMinified(filePath) {
  if (!fs.existsSync(filePath)) return false;

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  // Check if file is on very few lines and very long per line
  return (
    lines.length <= 10 &&
    lines.some(line => line.length > 500)
  );
}

async function main() {
  console.log('🔧 Replacing Minified API Files with Stubs\n');

  let replaced = 0;
  let skipped = 0;
  let notFound = 0;

  for (const apiFile of MINIFIED_API_FILES) {
    const fullPath = path.join(workspaceDir, apiFile);
    const relPath = path.relative(workspaceDir, fullPath);

    if (!fs.existsSync(fullPath)) {
      console.log(`⏭️  NOT FOUND: ${relPath}`);
      notFound++;
      continue;
    }

    if (!isFileMinified(fullPath)) {
      console.log(`✅ OK (not minified): ${relPath}`);
      skipped++;
      continue;
    }

    // Backup original
    const backupPath = `${fullPath}.minified-backup`;
    fs.copyFileSync(fullPath, backupPath);

    // Write stub
    fs.writeFileSync(fullPath, STUB_TEMPLATE(apiFile), 'utf-8');

    console.log(`🔄 REPLACED: ${relPath}`);
    replaced++;
  }

  console.log(`\n📊 Results:`);
  console.log(`  ✅ Replaced: ${replaced}`);
  console.log(`  ⏭️  Not found: ${notFound}`);
  console.log(`  ✅ Already OK: ${skipped}`);
  console.log(`\n💾 Backups saved with .minified-backup extension\n`);

  console.log(`🚀 Next steps:`);
  console.log(`  1. Run: npm run check:ultra-fast`);
  console.log(`  2. TypeScript should now compile with 0-50 errors`);
  console.log(`  3. Restore endpoints one by one from git history`);
  console.log(`  4. Or reimplements them with proper TypeScript\n`);
}

main().catch(console.error);
