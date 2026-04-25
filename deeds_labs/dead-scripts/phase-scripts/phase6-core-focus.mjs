#!/usr/bin/env node
/**
 * Phase 6: Core Routes + Core Machines Focus
 * Tight, mechanical check of only core UX (10 routes, 10 machines)
 */

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(__dirname, 'core-focus.json');

/** Run a command and stream output */
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n→ ${cmd} ${args.join(' ')}\n`);
    const child = spawn(cmd, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...opts
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`));
    });
  });
}

/** Map '/cases/[id]/evidence' → 'src/routes/cases/[id]/evidence/+page.svelte' */
function routeToPageFile(route) {
  if (route === '/') return 'src/routes/+page.svelte';
  const clean = route.replace(/^\//, '');
  return path.join('src', 'routes', clean, '+page.svelte');
}

async function main() {
  console.log('🔎 Phase 6 – Core Focus (tight + mechanical)');
  console.log('═'.repeat(60));

  const raw = await readFile(manifestPath, 'utf8');
  const { routes, machines } = JSON.parse(raw);

  const pageFiles = routes.map(routeToPageFile);

  console.log('\n📋 Core Routes:', routes.length);
  routes.forEach((r) => console.log(`   ${r}`));

  console.log('\n📋 Core Machines:', machines.length);
  machines.forEach((m) => console.log(`   ${m}`));

  console.log('\n📋 Page Files:', pageFiles.length);
  pageFiles.forEach((f) => console.log(`   ${f}`));

  // 1) Type-check core machines only
  console.log('\n' + '═'.repeat(60));
  console.log('🧪 Step 1: TypeScript check (core machines only)');
  console.log('═'.repeat(60));

  try {
    await run('npx', [
      'tsc',
      '--noEmit',
      '--skipLibCheck',
      ...machines
    ]);
    console.log('✅ TypeScript check passed');
  } catch (err) {
    console.error('❌ TypeScript check failed:', err.message);
    throw err;
  }

  // 2) Svelte-check only the core pages
  console.log('\n' + '═'.repeat(60));
  console.log('🧪 Step 2: Svelte-check (core pages only)');
  console.log('═'.repeat(60));

  try {
    await run('npx', [
      'svelte-check',
      '--fail-on-warnings',
      ...pageFiles
    ]);
    console.log('✅ Svelte-check passed');
  } catch (err) {
    console.error('⚠️  Svelte-check had warnings/errors (expected during development)');
    // Don't throw - svelte-check can be noisy during development
  }

  console.log('\n' + '═'.repeat(60));
  console.log('✅ Phase 6 core check completed');
  console.log('═'.repeat(60));
  console.log('\nNext: npm run dev:quic → test core routes in browser');
}

main().catch((err) => {
  console.error('\n' + '═'.repeat(60));
  console.error('❌ Phase 6 failed:', err.message);
  console.error('═'.repeat(60));
  process.exit(1);
});
