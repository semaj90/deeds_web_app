#!/usr/bin/env node
/**
 * Unified Type Check + SIMD Parser Integration Check
 * Runs all checks together using ZX for shell scripting
 */

import { $ } from 'zx';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(__dirname);

let checksPass = 0;
let checksFail = 0;

async function runCheck(name, command) {
  try {
    console.log(`\n📋 ${name}...`);
    const startTime = performance.now();

    await $`${command}`;

    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ ${name} [${duration}s]`);
    checksPass++;
    return true;
  } catch (error) {
    console.error(`❌ ${name} failed:`, error.message);
    checksFail++;
    return false;
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║       UNIFIED TYPE CHECK + SIMD INTEGRATION TEST       ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  const checks = [
    {
      name: '1️⃣  Svelte Type Checking',
      command: `npm --prefix ${path.join(rootDir, 'sveltekit-frontend')} run check:ultra-fast`
    },
    {
      name: '2️⃣  TypeScript Type Checking',
      command: `npx tsc --noEmit --skipLibCheck -p ${path.join(rootDir, 'sveltekit-frontend')}`
    },
    {
      name: '3️⃣  SIMD Parser Import Test',
      command: `node -e "import('${path.join(rootDir, 'sveltekit-frontend/src/lib/services/unified-simd-parser.ts')}').then(() => console.log('✅ SIMD parser import successful')).catch(e => { console.error('❌ SIMD parser import failed:', e.message); process.exit(1); })"`
    }
  ];

  for (const check of checks) {
    await runCheck(check.name, check.command);
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║                     CHECK SUMMARY                       ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`✅ Passed: ${checksPass}`);
  console.log(`❌ Failed: ${checksFail}`);
  console.log(`⏱️  Total Checks: ${checksPass + checksFail}`);

  if (checksFail === 0) {
    console.log('\n🎉 All checks passed! System is ready for development.\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some checks failed. Please review errors above.\n');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
