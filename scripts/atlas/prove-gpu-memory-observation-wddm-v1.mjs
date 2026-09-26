#!/usr/bin/env node
/**
 * BITFROST-GPU-MEMORY-ADMISSION-01 (stage D) -- WDDM + nvidia-smi observation adapter.
 *
 * Captures, in one receipt, side-by-side with a fresh stage-C CUDA reading:
 *   - deviceFreeObserved  -- real nvidia-smi reading (reuses
 *     scripts/atlas/bitfrost-l2-01/run-l2-persist-bench.mjs's exact
 *     `nvidia-smi --query-gpu=memory.free,memory.total` pattern verbatim,
 *     not re-derived).
 *   - wddmCurrentUsage    -- real Windows "GPU Adapter Memory\Dedicated Usage"
 *     performance counter, summed across every process on the LUID with the
 *     largest aggregate usage (the discrete NVIDIA adapter -- confirmed live
 *     on this host to be distinguishable from a near-zero secondary LUID
 *     without hardcoding a LUID string).
 *   - cudaContextFree     -- re-invokes the stage-C probe
 *     (python/parent_atlas_tensor/gpu_memory_probe.py over WSL2, same
 *     spawn convention, not a new transport).
 *
 * Honest limitation, NOT worked around: the true WDDM "Budget" field
 * (IDXGIAdapter3::QueryVideoMemoryInfo) is not reachable from PowerShell
 * performance counters or WMI -- only "Usage"/"Committed" counters are
 * exposed that way. Getting the literal Budget value requires a native COM
 * call (a small N-API/C++ addon), which is out of scope for this
 * PowerShell/WMI bridge per the task's own "small native addon OR
 * PowerShell/WMI bridge" framing -- this stage takes the bridge option and
 * leaves `wddmBudget` explicitly null rather than fabricating an
 * approximation from a different probe's number. Do not backfill
 * `wddmBudget` from nvidia-smi's memory.total -- that would silently mix
 * two different provenance sources under one field, which is exactly what
 * GpuMemoryObservationV1's WDDM_SOURCE_MISMATCH check exists to catch.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_PATH = join(REPO_ROOT, 'docs', 'reports', 'gpu-memory-observation-wddm-v1.json');

const pythonRoot = '/mnt/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/python';
const python = '/home/james/.venvs/atlas-cutile-cu132/bin/python';

// ---- nvidia-smi reading (verbatim pattern from run-l2-persist-bench.mjs) ----
function nvidiaSmiSnapshot() {
  try {
    const out = execFileSync(
      'nvidia-smi',
      ['--query-gpu=memory.free,memory.total', '--format=csv,noheader,nounits'],
      { encoding: 'utf8' },
    ).trim();
    const [freeMib, totalMib] = out.split(',').map((s) => Number(s.trim()));
    return {
      available: true,
      freeVramMib: freeMib,
      totalVramMib: totalMib,
      freeVramBytes: Math.round(freeMib * 1024 * 1024),
      totalVramBytes: Math.round(totalMib * 1024 * 1024),
    };
  } catch (err) {
    return { available: false, error: String(err?.message ?? err) };
  }
}

// ---- WDDM "Dedicated Usage" performance counter, real Windows signal ----
function wddmDedicatedUsageSnapshot() {
  const psScript = `
$ErrorActionPreference = 'Stop'
$samples = (Get-Counter -Counter '\\GPU Process Memory(*)\\Dedicated Usage').CounterSamples
$byLuid = @{}
foreach ($s in $samples) {
  if ($s.InstanceName -match '_luid_(0x[0-9a-fA-F]+_0x[0-9a-fA-F]+_phys_\\d+)') {
    $luid = $Matches[1]
    if (-not $byLuid.ContainsKey($luid)) { $byLuid[$luid] = 0 }
    $byLuid[$luid] += $s.CookedValue
  }
}
$top = $byLuid.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1
$result = [ordered]@{
  available = $true
  dominantLuid = $top.Key
  dedicatedUsageBytes = [int64]$top.Value
  allLuids = $byLuid
}
$result | ConvertTo-Json -Compress
`.trim();

  const proc = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
    encoding: 'utf8',
  });
  if (proc.status !== 0) {
    return { available: false, error: proc.stderr?.trim() || `exit code ${proc.status}` };
  }
  try {
    const parsed = JSON.parse(proc.stdout.trim());
    return { available: true, ...parsed };
  } catch (err) {
    return { available: false, error: `JSON parse failed: ${String(err)}`, rawStdout: proc.stdout };
  }
}

// ---- stage-C CUDA reading, reused verbatim (same spawn convention) ----
function runCudaProbe() {
  return new Promise((resolve) => {
    const child = spawn('wsl.exe', [
      '-e', 'bash', '-lc',
      `cd ${pythonRoot} && PYTHONPATH=. ${python} -m parent_atlas_tensor.gpu_memory_probe`,
    ]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.on('error', (err) => resolve({ code: -1, stdout: '', stderr: String(err) }));
  });
}

async function main() {
  const nvidiaSmi = nvidiaSmiSnapshot();
  const wddm = wddmDedicatedUsageSnapshot();
  const cudaProbeRaw = await runCudaProbe();

  let cudaObservation = null;
  try {
    cudaObservation = JSON.parse(cudaProbeRaw.stdout);
  } catch {
    cudaObservation = null;
  }

  const cudaContextFreeBytes = cudaObservation?.ok === true ? cudaObservation.cudaContextFree?.value ?? null : null;
  const deviceFreeObservedBytes = nvidiaSmi.available ? nvidiaSmi.freeVramBytes : null;

  const discrepancy = (cudaContextFreeBytes !== null && deviceFreeObservedBytes !== null && deviceFreeObservedBytes > 0)
    ? {
      cudaContextFreeBytes,
      deviceFreeObservedBytesNvidiaSmi: deviceFreeObservedBytes,
      absoluteDeltaBytes: cudaContextFreeBytes - deviceFreeObservedBytes,
      ratio: Number((cudaContextFreeBytes / deviceFreeObservedBytes).toFixed(3)),
      matchesPriorBitfrostL201Finding: cudaContextFreeBytes > deviceFreeObservedBytes,
    }
    : null;

  const observationV1Shape = {
    schema: 'atlas.gpu-memory-observation.v1',
    observedAt: new Date().toISOString(),
    deviceFreeObserved: deviceFreeObservedBytes !== null
      ? { value: deviceFreeObservedBytes, source: 'nvidia-smi' }
      : null,
    // Real WDDM budget (IDXGIAdapter3::QueryVideoMemoryInfo) is NOT reachable
    // from PowerShell/WMI -- left null rather than fabricated. See header.
    wddmBudget: null,
    wddmCurrentUsage: wddm.available && typeof wddm.dedicatedUsageBytes === 'number'
      ? { value: wddm.dedicatedUsageBytes, source: 'wddm' }
      : null,
    cudaContextFree: cudaContextFreeBytes !== null
      ? { value: cudaContextFreeBytes, source: 'cuda-context' }
      : null,
    deviceLabel: cudaObservation?.deviceLabel ?? null,
    writesPerformed: false,
  };

  const plausible = Boolean(
    nvidiaSmi.available &&
    wddm.available &&
    typeof wddm.dedicatedUsageBytes === 'number' &&
    wddm.dedicatedUsageBytes >= 0 &&
    nvidiaSmi.totalVramBytes > 0 &&
    wddm.dedicatedUsageBytes <= nvidiaSmi.totalVramBytes * 1.05, // small slack for WDDM overcommit rounding
  );

  const report = {
    schema: 'atlas.gpu-memory-observation-wddm-proof.v1',
    test: 'BITFROST-GPU-MEMORY-ADMISSION-01-STAGE-D',
    read_only: true,
    canonical_production_data_touched: false,
    canonical_production_data_mutated: false,
    writesPerformed: false,
    nvidiaSmi,
    wddm,
    cudaProbe: { processExitCode: cudaProbeRaw.code, stderr: cudaProbeRaw.stderr, observation: cudaObservation },
    discrepancy,
    observationV1Shape,
    limitation: 'wddmBudget (IDXGIAdapter3::QueryVideoMemoryInfo) is not reachable from PowerShell performance counters or WMI on this host -- only Usage/Committed counters are exposed that way. This stage captures wddmCurrentUsage (real "GPU Process Memory\\Dedicated Usage" perf counter, summed across all processes on the dominant discrete-GPU LUID) and deviceFreeObserved (real nvidia-smi reading) side-by-side with the stage-C cudaContextFree reading, but does NOT fabricate a wddmBudget value from a different probe.',
    plausibilityCheck: {
      criterion: 'nvidia-smi and WDDM dedicated-usage readings both available and internally consistent (dedicated usage does not exceed total VRAM beyond overcommit slack)',
      plausible,
    },
    RESULT: plausible ? 'DRY_RUN_PROVEN' : 'FAIL',
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  console.log('Report:', OUT_PATH);
  process.exit(plausible ? 0 : 1);
}

main();
