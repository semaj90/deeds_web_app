#!/usr/bin/env node
/**
 * Phase 4: cuVS Recall Baseline Validation Runner
 *
 * WSL2-first wrapper for the RAPIDS cuVS recall baseline.
 * The environment is expected at ~/miniforge3/envs/atlas-rapids-cu13.
 */

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WSL_CONDA_INIT = 'source ~/miniforge3/etc/profile.d/conda.sh';
const WSL_ENV = 'atlas-rapids-cu13';
const SCRIPT_PATH = join(__dirname, 'phase4-cuVS-recall-validation.py');
const WSL_SCRIPT_PATH = `/mnt/c/Users/james/Videos/deeds-web-app/scripts/gpu/phase4-cuVS-recall-validation.py`;
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

function runWsl(command, inherit = false) {
  const exportedDbUrl = DATABASE_URL.replace(/'/g, `'\\''`);
  return spawnSync('wsl', ['bash', '-lc', `${WSL_CONDA_INIT} && export DATABASE_URL='${exportedDbUrl}' && ${command}`], {
    encoding: 'utf-8',
    stdio: inherit ? 'inherit' : 'pipe',
    env: {
      ...process.env,
      DATABASE_URL,
    },
  });
}

function ensureScriptExists() {
  if (!existsSync(SCRIPT_PATH)) {
    throw new Error(`Script not found: ${SCRIPT_PATH}`);
  }
}

function verifyEnvironment() {
  console.log('[1/4] Verifying WSL2 RAPIDS environment...');
  const proc = runWsl(`conda run -n ${WSL_ENV} python - <<'PY'
import sys
try:
    import cuvs
    import cupy as cp
    import psycopg
    print(f"✓ cuVS {cuvs.__version__}")
    print(f"✓ CuPy {cp.__version__}")
    print("✓ psycopg3")
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
PY`);

  if (proc.status !== 0) {
    throw new Error(proc.stderr || 'WSL2 environment check failed');
  }

  console.log(proc.stdout.trim().split('\n').map((line) => `  ${line}`).join('\n'));
}

function verifyDatabase() {
  console.log('\n[2/4] Verifying database connectivity...');
  const proc = runWsl(`conda run -n ${WSL_ENV} python - <<'PY'
import os
import sys
import psycopg

db_url = os.environ['DATABASE_URL']

try:
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) FROM codebase_chunk_index WHERE content_embedding IS NOT NULL')
            count = cur.fetchone()[0]
            print(f'✓ {count} embeddings available')
            if count < 100:
                print('⚠️ Warning: < 100 embeddings, validation may be unreliable', file=sys.stderr)
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
    sys.exit(1)
PY`);

  if (proc.status !== 0) {
    throw new Error(proc.stderr || 'Database check failed');
  }

  console.log(proc.stdout.trim().split('\n').map((line) => `  ${line}`).join('\n'));
}

function runValidation() {
  console.log('\n[3/4] Running cuVS recall validation...');
  console.log(`  Script: ${SCRIPT_PATH}`);
  console.log(`  Database: ${DATABASE_URL.split('@')[1] || 'local'}`);
  console.log('');

  ensureScriptExists();

  const proc = runWsl(`conda run -n ${WSL_ENV} python ${WSL_SCRIPT_PATH}`, true);
  if (proc.status !== 0) {
    throw new Error(`Validation script exited with code ${proc.status}`);
  }
}

function main() {
  console.log('='.repeat(80));
  console.log('Phase 4: cuVS Recall Baseline Validation');
  console.log('='.repeat(80));
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('');

  try {
    if (!existsSync(SCRIPT_PATH)) {
      throw new Error(`Script not found: ${SCRIPT_PATH}`);
    }

    verifyEnvironment();
    verifyDatabase();
    runValidation();

    console.log('\n[4/4] Validation complete');
    console.log('='.repeat(80));
    console.log('');
    console.log('📊 Results saved to: phase4-cuVS-recall-results.json');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Review recall@K metrics (target: @10>=0.95, @50>=0.97, @100>=0.98)');
    console.log('  2. Review latency distribution (target: <10ms per query)');
    console.log('  3. Adjust n_probes if needed and re-run');
    console.log('  4. Proceed to Phase 5 (domain classification) if targets met');
    console.log('');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
