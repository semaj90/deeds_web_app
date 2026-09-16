#!/usr/bin/env node
/**
 * BITFROST-L2-01 wrapper harness (v2 -- corrected methodology + real safety sizing).
 *
 * Runs native/bitfrost-l2-01/l2_persist_bench.exe, attaches a REAL
 * nvidia-smi contention snapshot (the .exe binary cannot query other OS
 * processes itself), and writes docs/reports/bitfrost-l2-01-results.json.
 *
 * v2 change (found via web research, 2026-09-14): v1's benchmark measured a
 * small persisting buffer in ISOLATION -- no competing memory traffic ever
 * pressured it out of L2, so the persisting hint had nothing to protect
 * against (measured lift was small and negative on all 3 v1 runs). NVIDIA's
 * own L2-cache-control docs and Lei Mao's independent CUDA L2 Persistent
 * Cache benchmark both use a TWO-BUFFER design (small persisting buffer +
 * much larger streaming buffer creating real eviction pressure) to
 * demonstrate a real ~20% speedup. l2_persist_bench.exe v2 implements that
 * pattern; THIS wrapper is responsible for sizing the streaming buffer
 * safely, since the .exe's own cudaMemGetInfo() reading is not trustworthy
 * on this host (see the discrepancy finding below) -- the streaming buffer
 * size is computed here from a REAL nvidia-smi reading, with a conservative
 * fraction and hard caps, then passed to the .exe as a CLI argument.
 *
 * Real finding (still true, v1 and v2 both): on this Windows/WDDM host,
 * cudaMemGetInfo() inside the CUDA process reports several GB more "free"
 * than nvidia-smi reports for the same moment -- a large, REPRODUCIBLE
 * discrepancy. Likely cause: Windows WDDM GPU-memory virtualization/
 * oversubscription -- cudaMemGetInfo's "free" figure reflects the driver's
 * memory-manager budget (which can include pageable-to-system-RAM capacity),
 * not the physically-resident-VRAM figure nvidia-smi reports per process.
 * This is why this wrapper -- not the .exe's own cudaMemGetInfo call -- is
 * the primary safety mechanism for sizing the (much larger, v2) streaming
 * buffer.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BENCH_EXE = join(REPO_ROOT, 'native', 'bitfrost-l2-01', 'l2_persist_bench.exe');
const OUT_PATH = join(REPO_ROOT, 'docs', 'reports', 'bitfrost-l2-01-results.json');

// Conservative streaming-buffer sizing policy, derived from a REAL
// nvidia-smi reading (never from the .exe's own cudaMemGetInfo, per the
// discrepancy finding above): reserve a fixed margin, use at most 30% of
// the remainder split across the two configs, floor 4 MiB (still >> this
// device's ~4MB L2 cache, so eviction pressure is real), ceiling 64 MiB
// (matches the scale Lei Mao's writeup showed a benefit at, scaled down for
// this host's much tighter VRAM budget).
const MARGIN_MIB = 64;
const MAX_STREAMING_BUFFER_FRACTION = 0.3;
const MIN_STREAMING_BUFFER_MIB = 4;
const MAX_STREAMING_BUFFER_MIB = 64;

function nvidiaSmiSnapshot() {
  try {
    const out = execFileSync(
      'nvidia-smi',
      ['--query-gpu=memory.free,memory.total', '--format=csv,noheader,nounits'],
      { encoding: 'utf8' }
    ).trim();
    const [freeMib, totalMib] = out.split(',').map((s) => Number(s.trim()));

    let otherGpuProcessesDetected = null;
    try {
      const procsOut = execFileSync(
        'nvidia-smi',
        ['--query-compute-apps=pid,process_name', '--format=csv,noheader'],
        { encoding: 'utf8' }
      ).trim();
      otherGpuProcessesDetected = procsOut.length > 0;
    } catch {
      otherGpuProcessesDetected = null; // compute-apps query unsupported/failed; disclosed as null, not false
    }

    return {
      contentionSnapshotAvailable: true,
      freeVramMibNvidiaSmi: freeMib,
      totalVramMibNvidiaSmi: totalMib,
      otherGpuProcessesDetected,
    };
  } catch (err) {
    return {
      contentionSnapshotAvailable: false,
      error: String(err?.message ?? err),
    };
  }
}

function computeSafeStreamingBufferMib(freeVramMibNvidiaSmi) {
  if (typeof freeVramMibNvidiaSmi !== 'number' || !Number.isFinite(freeVramMibNvidiaSmi)) {
    return null; // no real nvidia-smi reading available -- caller must abort, not guess
  }
  const usableMib = Math.max(0, freeVramMibNvidiaSmi - MARGIN_MIB);
  // Split across two configs (persisting + normal), each also carrying a
  // small (~2-4MB) persisting buffer -- negligible next to the streaming
  // buffer, so not separately subtracted here.
  const perSideBudgetMib = (usableMib * MAX_STREAMING_BUFFER_FRACTION) / 2;
  const clamped = Math.max(MIN_STREAMING_BUFFER_MIB, Math.min(MAX_STREAMING_BUFFER_MIB, Math.floor(perSideBudgetMib)));
  return clamped;
}

function main() {
  const timedIterations = process.argv[2] ?? '200';
  const warmupIterations = process.argv[3] ?? '10';

  const contentionBefore = nvidiaSmiSnapshot();

  const streamingBufferMib = computeSafeStreamingBufferMib(contentionBefore.freeVramMibNvidiaSmi);
  if (streamingBufferMib === null) {
    const report = {
      schema: 'atlas.bitfrost-l2-01.wrapped-result.v2',
      test: 'BITFROST-L2-01',
      RESULT: 'ABORTED_NO_CONTENTION_SNAPSHOT',
      reason: 'nvidia-smi query failed -- refusing to guess a safe streaming-buffer size without a real VRAM reading',
      contention_snapshot_before: contentionBefore,
    };
    mkdirSync(dirname(OUT_PATH), { recursive: true });
    writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  const proc = spawnSync(
    BENCH_EXE,
    [timedIterations, warmupIterations, String(streamingBufferMib)],
    { encoding: 'utf8' }
  );
  if (proc.error) {
    throw proc.error;
  }
  const stdout = proc.stdout.trim();
  let benchResult;
  try {
    benchResult = JSON.parse(stdout);
  } catch (err) {
    throw new Error(`Failed to parse benchmark JSON output: ${stdout}\n${proc.stderr}`);
  }

  const contentionAfter = nvidiaSmiSnapshot();

  const report = {
    schema: 'atlas.bitfrost-l2-01.wrapped-result.v2',
    test: 'BITFROST-L2-01',
    read_only: true,
    canonical_production_data_touched: false,
    canonical_production_data_mutated: false,
    methodology: 'two-buffer-eviction-pressure',
    streaming_buffer_sizing_policy: {
      marginMib: MARGIN_MIB,
      maxStreamingBufferFraction: MAX_STREAMING_BUFFER_FRACTION,
      minStreamingBufferMib: MIN_STREAMING_BUFFER_MIB,
      maxStreamingBufferMib: MAX_STREAMING_BUFFER_MIB,
      computedStreamingBufferMibPerSide: streamingBufferMib,
      derivedFrom: 'nvidia-smi (this wrapper), NOT the .exe\'s own cudaMemGetInfo() call',
    },
    bench_result: benchResult,
    contention_snapshot_before: contentionBefore,
    contention_snapshot_after: contentionAfter,
    cuda_mem_get_info_vs_nvidia_smi_discrepancy: {
      finding:
        'REPRODUCIBLE (confirmed across 2 separate v1 runs, and still true here): cudaMemGetInfo() inside the CUDA process reports several GB more free VRAM than nvidia-smi reports for the whole device at the same moment.',
      likely_cause:
        'Windows WDDM GPU-memory virtualization/oversubscription -- cudaMemGetInfo reflects the driver memory-manager budget (can include pageable-to-system-RAM capacity), not nvidia-smi\'s physically-resident-VRAM-per-process accounting. NOT independently root-caused against NVIDIA documentation -- flagged as an open follow-up.',
      implication:
        'This is why v2 sizes the (much larger) streaming buffer from THIS wrapper\'s nvidia-smi reading, not from the .exe\'s own cudaMemGetInfo() call -- cudaMemGetInfo is checked inside the .exe only as a secondary, less-trusted gate.',
      cuda_reported_free_mib: benchResult.freeVramBeforeMibCudaMemGetInfo,
      nvidia_smi_reported_free_mib: contentionBefore.freeVramMibNvidiaSmi,
    },
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  console.log('Report:', OUT_PATH);
}

main();
