#!/usr/bin/env node
/**
 * BITFROST-GPU-MEMORY-ADMISSION-01 (stage C) -- CUDA observation adapter proof.
 *
 * Invokes python/parent_atlas_tensor/gpu_memory_probe.py over WSL2 (same
 * spawn convention as prove-unified-residency-stdio-handoff-v1.mjs -- not a
 * new transport) and records the real cudaContextFree reading it returns.
 *
 * This proves the reading is PLAUSIBLE against a real WSL2 CUDA context --
 * it does NOT claim this reading is trustworthy alone (per the existing
 * BITFROST-L2-01 finding, cudaMemGetInfo overstates free memory relative to
 * nvidia-smi on this host; stage D's nvidia-smi/WDDM adapter is required
 * before decideGpuMemoryAdmissionV1() should be fed a real decision).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pythonRoot = '/mnt/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/python';
const python = '/home/james/.venvs/atlas-cutile-cu132/bin/python';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_PATH = join(REPO_ROOT, 'docs', 'reports', 'gpu-memory-observation-cuda-v1.json');

function runProbe() {
  return new Promise((resolve, reject) => {
    const child = spawn('wsl.exe', [
      '-e', 'bash', '-lc',
      `cd ${pythonRoot} && PYTHONPATH=. ${python} -m parent_atlas_tensor.gpu_memory_probe`,
    ]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.on('error', reject);
  });
}

async function main() {
  const { code, stdout, stderr } = await runProbe();
  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    parseError = String(err);
  }

  const plausible = Boolean(
    parsed?.ok === true &&
    typeof parsed.cudaContextFree?.value === 'number' &&
    parsed.cudaContextFree.value > 0 &&
    typeof parsed.cudaContextTotal === 'number' &&
    parsed.cudaContextFree.value <= parsed.cudaContextTotal,
  );

  const report = {
    schema: 'atlas.gpu-memory-observation-cuda-proof.v1',
    test: 'BITFROST-GPU-MEMORY-ADMISSION-01-STAGE-C',
    read_only: true,
    canonical_production_data_touched: false,
    canonical_production_data_mutated: false,
    writesPerformed: false,
    processExitCode: code,
    stderr,
    parseError,
    observation: parsed,
    plausibilityCheck: {
      criterion: 'cudaContextFree.value must be a positive number not exceeding cudaContextTotal',
      plausible,
    },
    caveat: 'This reading is NOT trusted alone -- per this repo\'s existing BITFROST-L2-01 finding, cudaMemGetInfo overstates free memory relative to nvidia-smi on this host. Stage D (WDDM/nvidia-smi adapter) is required before this feeds a real admission decision.',
    RESULT: plausible ? 'DRY_RUN_PROVEN' : 'FAIL',
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  console.log('Report:', OUT_PATH);
  process.exit(plausible ? 0 : 1);
}

main();
