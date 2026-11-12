#!/usr/bin/env node
/**
 * scripts/atlas/verify-nes-lut-filter-avx2-receipt-v1.mjs
 *
 * Emits durable evidence receipt for NLUT-07 (CPU-AVX2-01):
 * - Confirms bit-identical output between AVX2 challenger and scalar oracle.
 * - Records latency, throughput, and speedup over frozen cohorts (0, 1, 31, 32, 33, 64, 100, 6,527).
 * - Proves fail-closed behavior on 0x00 (unresolved) and >0x0A (out-of-bounds).
 * - Exercises scalar fallback path.
 */

import fs from 'node:fs';
import path from 'path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const REPORT_PATH = path.resolve(
  process.cwd(),
  'docs/reports/nes-lut-filter-avx2-parity-receipt-v1.json'
);

function main() {
  console.log('[NLUT-07 / CPU-AVX2-01] Running AVX2 LUT filter parity suite...');
  const binaryPath = path.resolve(process.cwd(), 'simd-bridge/cpp/test_nes_lut_filter_avx2.exe');
  const sourceFiles = [
    'simd-bridge/cpp/nes_lut_filter_avx2.h',
    'simd-bridge/cpp/nes_lut_filter_avx2.cpp',
    'simd-bridge/cpp/test_nes_lut_filter_avx2.cpp',
  ];
  const sourceHashes = Object.fromEntries(sourceFiles.map((file) => [
    file,
    createHash('sha256').update(fs.readFileSync(path.resolve(process.cwd(), file))).digest('hex'),
  ]));
  console.log('Compiling current sources via MSVC cl.exe...');
  execSync(
    'cmd /c ""C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat" >nul && cl.exe /nologo /std:c++20 /O2 /arch:AVX2 /EHsc /Fe:simd-bridge\\cpp\\test_nes_lut_filter_avx2.exe simd-bridge\\cpp\\nes_lut_filter_avx2.cpp simd-bridge\\cpp\\test_nes_lut_filter_avx2.cpp"',
    { stdio: 'inherit' }
  );
  const output = execSync(binaryPath, { encoding: 'utf8' });
  console.log(output);

  const testRows = [...output.matchAll(/^\s+PASS \| (.*?) \|\s*(\d+) \|\s*(\d+) \|\s*([\d.]+) \|\s*([\d.]+) \|\s*([\d.]+)x\s*$/gm)];
  const totalMatch = output.match(/ALL (\d+) PARITY AND BENCHMARK TESTS PASSED/);
  const avx2Supported = /CPU AVX2 support: YES/.test(output);
  const dispatcherVerified = /Dispatcher verified: force_scalar correctly bypasses AVX2; auto mode uses AVX2/.test(output);
  if (!avx2Supported || !dispatcherVerified || !totalMatch || Number(totalMatch[1]) !== testRows.length || testRows.length === 0) {
    throw new Error('Harness output did not satisfy the expected AVX2, dispatcher, and complete-test receipt contract.');
  }
  const cohortSingleDomain = testRows.filter((row) => row[1].startsWith('Cohort 6527 Domain '));
  const cohortMask = testRows.filter((row) => row[1].startsWith('Cohort 6527 Multi-Domain Mask'));
  const mean = (rows, index) => rows.length
    ? rows.reduce((sum, row) => sum + Number(row[index]), 0) / rows.length
    : null;
  const executionOutputSha256 = createHash('sha256').update(output).digest('hex');

  const receipt = {
    schema: 'atlas.nes-lut-filter-avx2-parity.v1',
    generatedAt: new Date().toISOString(),
    status: 'PASS_STANDALONE_HARNESS',
    gate: 'NLUT-07 / CPU-AVX2-01',
    acceptanceStatus: 'PARTIAL',
    scope: 'Standalone scalar/AVX2 filtering and dispatcher harness; does not exercise tensorrt_bridge.node or exact KNN.',
    hardware: {
      cpuArch: process.arch,
      avx2Supported,
      compiler: 'MSVC cl.exe /std:c++20 /O2 /arch:AVX2',
      gpuClaim: false,
    },
    execution: {
      command: 'cl.exe /nologo /std:c++20 /O2 /arch:AVX2 /EHsc /Fe:simd-bridge\\cpp\\test_nes_lut_filter_avx2.exe simd-bridge\\cpp\\nes_lut_filter_avx2.cpp simd-bridge\\cpp\\test_nes_lut_filter_avx2.cpp; execute test_nes_lut_filter_avx2.exe',
      exitCode: 0,
      outputSha256: executionOutputSha256,
      binarySha256: createHash('sha256').update(fs.readFileSync(binaryPath)).digest('hex'),
      sourceSha256: sourceHashes,
    },
    invariants: {
      bitExactParity: true,
      failClosedZeroByte: true,
      failClosedOutOfBounds: true,
      scalarFallbackExercised: dispatcherVerified,
      dispatcherVerified,
      testCasesPassed: testRows.length,
      frozenCohortSizesTested: [...new Set(testRows.map((row) => Number(row[2])))].sort((a, b) => a - b),
    },
    benchmarkSummary: {
      diagnosticOnly: true,
      note: 'Single local run; timings are noisy and are not acceptance-grade performance evidence.',
      cohort6527SingleDomainRuns: cohortSingleDomain.map((row) => ({
        name: row[1], count: Number(row[2]), scalarUs: Number(row[4]), avx2Us: Number(row[5]), speedup: Number(row[6]),
      })),
      cohort6527SingleDomainMeanScalarUs: mean(cohortSingleDomain, 4),
      cohort6527SingleDomainMeanAvx2Us: mean(cohortSingleDomain, 5),
      cohort6527MultiDomainRuns: cohortMask.map((row) => ({
        name: row[1], count: Number(row[2]), scalarUs: Number(row[4]), avx2Us: Number(row[5]), speedup: Number(row[6]),
      })),
    },
    sourceFiles,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  console.log(`✓ Receipt emitted: ${REPORT_PATH}`);
}

main();
