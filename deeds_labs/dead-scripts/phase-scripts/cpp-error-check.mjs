#!/usr/bin/env node

/**
 * C++ Error Analysis Tool - Similar to svelte-check for C++ components
 *
 * Parses C++ compiler output, CUDA errors, and LibTorch errors
 * Exports to JSON format compatible with Phase72 pipeline
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const LOG_DIR = 'logs';
const CPP_ERROR_LOG = path.join(LOG_DIR, 'cpp-errors.log');
const OUTPUT_JSON = path.join(LOG_DIR, 'cpp-errors-analysis.json');

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Parse MSVC compiler errors
 */
function parseMSVCErrors(buildOutput) {
  const errors = [];
  const lines = buildOutput.split('\n');

  // MSVC error format: file(line,col): error C2664: message
  const msvcRegex = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+([A-Z]\d+):\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(msvcRegex);
    if (match) {
      errors.push({
        file: match[1].trim(),
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        severity: match[4],
        code: match[5],
        message: match[6],
        category: 'MSVC',
        timestamp: new Date().toISOString()
      });
    }
  }

  return errors;
}

/**
 * Parse CUDA nvcc errors
 */
function parseCUDAErrors(buildOutput) {
  const errors = [];
  const lines = buildOutput.split('\n');

  // CUDA error format: file(line): error: message
  const cudaRegex = /^(.+?)\((\d+)\):\s+(error|warning):\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(cudaRegex);
    if (match) {
      errors.push({
        file: match[1].trim(),
        line: parseInt(match[2]),
        column: 0,
        severity: match[3],
        code: '',
        message: match[4],
        category: 'CUDA',
        timestamp: new Date().toISOString()
      });
    }
  }

  return errors;
}

/**
 * Parse C++ error logger JSON output
 */
function parseCppLoggerErrors() {
  if (!fs.existsSync(CPP_ERROR_LOG)) {
    return [];
  }

  const errors = [];
  const lines = fs.readFileSync(CPP_ERROR_LOG, 'utf-8').split('\n');

  for (const line of lines) {
    if (line.trim()) {
      try {
        const error = JSON.parse(line);
        errors.push(error);
      } catch (e) {
        console.error('Failed to parse error line:', line);
      }
    }
  }

  return errors;
}

/**
 * Run CMake build and capture errors
 */
function runCMakeBuild() {
  console.log('🔨 Building C++ components with CMake...');

  try {
    const output = execSync(
      'cmake --build build --config Release',
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );

    return { success: true, output };

  } catch (error) {
    return {
      success: false,
      output: error.stdout + '\n' + error.stderr
    };
  }
}

/**
 * Analyze all C++ errors
 */
async function analyzeErrors() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  C++ Component Error Analysis (like svelte-check)');
  console.log('═══════════════════════════════════════════════════════\n');

  const allErrors = [];

  // 1. Check runtime errors from C++ logger
  console.log('📝 Step 1: Checking runtime errors from C++ logger...');
  const runtimeErrors = parseCppLoggerErrors();
  allErrors.push(...runtimeErrors);
  console.log(`   Found ${runtimeErrors.length} runtime errors\n`);

  // 2. Run CMake build to get compile-time errors
  console.log('📝 Step 2: Running CMake build to check compile errors...');
  const buildResult = runCMakeBuild();

  const msvcErrors = parseMSVCErrors(buildResult.output);
  const cudaErrors = parseCUDAErrors(buildResult.output);

  allErrors.push(...msvcErrors);
  allErrors.push(...cudaErrors);

  console.log(`   Found ${msvcErrors.length} MSVC errors`);
  console.log(`   Found ${cudaErrors.length} CUDA errors\n`);

  // 3. Categorize and summarize
  const summary = {
    total: allErrors.length,
    byCategory: {},
    bySeverity: {
      error: 0,
      warning: 0,
      critical: 0,
      info: 0
    },
    byFile: {}
  };

  for (const error of allErrors) {
    // Category count
    summary.byCategory[error.category] = (summary.byCategory[error.category] || 0) + 1;

    // Severity count
    const sev = error.severity.toLowerCase();
    if (sev in summary.bySeverity) {
      summary.bySeverity[sev]++;
    }

    // File count
    if (error.file) {
      summary.byFile[error.file] = (summary.byFile[error.file] || 0) + 1;
    }
  }

  // 4. Export to JSON
  console.log('📊 Exporting error analysis...');
  const analysis = {
    timestamp: new Date().toISOString(),
    summary,
    errors: allErrors,
    buildSuccess: buildResult.success
  };

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(analysis, null, 2));
  console.log(`   Exported to: ${OUTPUT_JSON}\n`);

  // 5. Print summary (svelte-check style)
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Total errors: ${summary.total}`);
  console.log(`  - Errors: ${summary.bySeverity.error}`);
  console.log(`  - Warnings: ${summary.bySeverity.warning}`);
  console.log(`  - Critical: ${summary.bySeverity.critical}`);
  console.log(`  - Info: ${summary.bySeverity.info}\n`);

  console.log('By category:');
  for (const [category, count] of Object.entries(summary.byCategory)) {
    console.log(`  - ${category}: ${count}`);
  }
  console.log('\n');

  // 6. Print top errors
  if (allErrors.length > 0) {
    console.log('Top 10 errors:');
    allErrors.slice(0, 10).forEach((err, idx) => {
      const location = err.file ? `${err.file}:${err.line}:${err.column}` : 'runtime';
      console.log(`${idx + 1}. [${err.category}] ${location}`);
      console.log(`   ${err.message}`);
      if (err.code) console.log(`   Code: ${err.code}`);
      console.log('');
    });
  }

  // 7. Exit code (0 if no errors, 1 if errors)
  const exitCode = summary.bySeverity.error + summary.bySeverity.critical;
  if (exitCode > 0) {
    console.log(`❌ cpp-check found ${exitCode} errors`);
    process.exit(1);
  } else {
    console.log('✅ cpp-check passed');
    process.exit(0);
  }
}

// Run analysis
analyzeErrors().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
