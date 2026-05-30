#!/usr/bin/env node

/**
 * Refresh Promotion States — Atlas Card Lifecycle Maintenance
 *
 * Regenerates memory/rewards/sourceRef-performance.json from the outcome ledger.
 * Run this script:
 * - Hourly (via cron) to keep promotion states fresh
 * - On-demand after high-traffic periods to capture new signals
 * - Before deploying major retrieval changes to baseline the system
 *
 * Usage:
 *   npm run phase19b:refresh-promotions
 *   npm run phase19b:refresh-promotions -- --dry-run
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = new URL('.', import.meta.url).pathname;
const repoRoot = join(__dirname, '../..');

const dryRun = process.argv.includes('--dry-run');

console.log('🔄 Refreshing promotion states from outcome ledger...\n');
console.log(`   Repo: ${repoRoot}`);
console.log(`   Dry-run: ${dryRun}\n`);

const args = [join(repoRoot, 'scripts/atlas/phase-19b-card-lifecycle-dryrun.mjs')];

const proc = spawn('node', args, {
  cwd: repoRoot,
  stdio: 'inherit',
});

proc.on('exit', (code) => {
  if (code === 0) {
    console.log('\n✅ Promotion states refreshed successfully');
    if (dryRun) {
      console.log('   (dry-run mode — no database writes)\n');
    } else {
      console.log('   Next step: Run `npm run drizzle:migrate` to persist promotion state queries\n');
    }
  } else {
    console.error(`\n❌ Refresh failed with exit code ${code}\n`);
    process.exit(1);
  }
});
