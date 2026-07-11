#!/usr/bin/env node
/**
 * Phase 4: Pre-flight Validation Check
 *
 * WSL2 RAPIDS lane only.
 * The RAPIDS env lives under ~/miniforge3 and must source conda.sh.
 */

import { spawnSync } from 'child_process';

const WSL_CONDA_INIT = 'source ~/miniforge3/etc/profile.d/conda.sh';
const WSL_ENV = 'atlas-rapids-cu13';
const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

let failCount = 0;

function runWsl(command) {
  const proc = spawnSync('wsl', ['bash', '-lc', `${WSL_CONDA_INIT} && ${command}`], {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (proc.status !== 0) {
    throw new Error((proc.stderr || proc.stdout || '').trim() || `WSL command failed: ${command}`);
  }
  return (proc.stdout || '').trim();
}

function runWslPython(pyCode) {
  const proc = spawnSync(
    'wsl',
    ['bash', '-lc', `${WSL_CONDA_INIT} && conda activate ${WSL_ENV} && python - <<'PY'\n${pyCode}\nPY`],
    { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
  );
  if (proc.status !== 0) {
    throw new Error((proc.stderr || proc.stdout || '').trim() || 'WSL python command failed');
  }
  return (proc.stdout || '').trim();
}

function test(name, fn) {
  try {
    const result = fn();
    if (result === false) {
      console.log(`  ❌ ${name}`);
      failCount++;
      return;
    }
    console.log(`  ✅ ${name}`);
  } catch (error) {
    console.log(`  ⚠️  ${name}: ${error.message}`);
    failCount++;
  }
}

console.log('='.repeat(80));
console.log('Phase 4: Pre-flight Validation Check');
console.log('='.repeat(80));
console.log('');

console.log('1. WSL2 Conda Environment');
test('Miniforge exists in WSL2', () => runWsl('test -d ~/miniforge3 && echo OK').includes('OK'));
test('conda is available after sourcing conda.sh', () => runWsl('conda --version').toLowerCase().includes('conda'));
test(`${WSL_ENV} environment exists`, () => runWsl('conda env list').includes(WSL_ENV));

console.log('\n2. Python Packages (in atlas-rapids-cu13)');
test('cuVS installed', () => {
  const output = runWslPython('import cuvs; print(cuvs.__version__)');
  console.log(`    └─ cuVS version: ${output}`);
  return output.length > 0;
});

test('CuPy installed', () => {
  const output = runWslPython('import cupy; print(cupy.__version__)');
  console.log(`    └─ CuPy version: ${output}`);
  return output.length > 0;
});

test('psycopg3 installed', () => {
  const output = runWslPython('import psycopg; print(psycopg.__version__)');
  console.log(`    └─ psycopg version: ${output}`);
  return output.length > 0;
});

test('NumPy installed', () => {
  const output = runWslPython('import numpy; print(numpy.__version__)');
  console.log(`    └─ NumPy version: ${output}`);
  return output.length > 0;
});

test('Pandas installed', () => {
  const output = runWslPython('import pandas; print(pandas.__version__)');
  console.log(`    └─ Pandas version: ${output}`);
  return output.length > 0;
});

console.log('\n3. GPU Availability');
test('NVIDIA GPU detected', () => {
  const gpu = spawnSync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (gpu.status !== 0) {
    throw new Error((gpu.stderr || gpu.stdout || '').trim() || 'nvidia-smi failed');
  }
  const output = (gpu.stdout || '').trim();
  console.log(`    └─ GPU: ${output}`);
  return output.length > 0;
});

test('CUDA available in Python', () => runWslPython('import cupy; cupy.cuda.Device(); print("CUDA_OK")').includes('CUDA_OK'));

console.log('\n4. Postgres Connectivity');
test('Postgres reachable', () => {
  const pyScript = `
import psycopg
with psycopg.connect("${DB_URL}") as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT 1")
        print("OK")
`;
  return runWslPython(pyScript).includes('OK');
});

test('Embeddings table exists', () => {
  const pyScript = `
import psycopg
with psycopg.connect("${DB_URL}") as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM codebase_chunk_index WHERE content_embedding IS NOT NULL")
        count = cur.fetchone()[0]
        print(f"Embeddings: {count}")
        raise SystemExit(0 if count > 100 else 1)
`;
  const output = runWslPython(pyScript);
  console.log(`    └─ ${output}`);
  return output.includes('Embeddings:');
});

console.log('\n5. Embedding Properties');
test('Embeddings are 768-dimensional', () => {
  const pyScript = `
import psycopg
import json
with psycopg.connect("${DB_URL}") as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT content_embedding FROM codebase_chunk_index WHERE content_embedding IS NOT NULL LIMIT 1")
        row = cur.fetchone()
        if row and row[0] is not None:
            vec = json.loads(row[0]) if isinstance(row[0], str) else list(row[0])
            print(f"Dimension: {len(vec)}")
            raise SystemExit(0 if len(vec) == 768 else 1)
        print("No embeddings found")
        raise SystemExit(1)
`;
  const output = runWslPython(pyScript);
  console.log(`    └─ ${output}`);
  return output.includes('Dimension: 768');
});

test('Embeddings appear normalized', () => {
  const pyScript = `
import psycopg
import numpy as np
import json
with psycopg.connect("${DB_URL}") as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT content_embedding FROM codebase_chunk_index WHERE content_embedding IS NOT NULL LIMIT 5")
        rows = cur.fetchall()
        for row in rows:
            raw = row[0]
            vec = np.array(json.loads(raw) if isinstance(raw, str) else list(raw), dtype=np.float32)
            norm = np.linalg.norm(vec)
            if abs(norm - 1.0) > 0.1:
                print(f"WARNING: Non-unit norm: {norm}")
                raise SystemExit(1)
        print(f"Sample embeddings OK ({len(rows)} sampled)")
`;
  const output = runWslPython(pyScript);
  console.log(`    └─ ${output}`);
  return !output.includes('WARNING');
});

console.log('\n' + '='.repeat(80));
if (failCount === 0) {
  console.log('✅ All checks passed! Ready to run Phase 4.');
  console.log('');
  console.log('Run validation with:');
  console.log('  npm run phase4:cuVS:recall:baseline');
  console.log('');
  process.exit(0);
}

console.log(`❌ ${failCount} check(s) failed. See above for details.`);
console.log('');
console.log('Common fixes:');
console.log('  1. Source Miniforge in WSL2: source ~/miniforge3/etc/profile.d/conda.sh');
console.log('  2. Activate env: conda activate atlas-rapids-cu13');
console.log('  3. Install packages: conda install cuvs-cu13 cupy-cuda12x pandas');
console.log('  4. Check GPU: nvidia-smi');
process.exit(1);
