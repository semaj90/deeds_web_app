#!/usr/bin/env node
/**
 * Phase 72 - Regenerate errors.jsonl
 * Runs fresh TypeScript check and converts to JSONL format
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function runTypeScriptCheck() {
  console.log('🔍 Running TypeScript check...\n');

  return new Promise((resolve, reject) => {
    const tsc = spawn('npx', ['tsc', '--noEmit', '--skipLibCheck', '-p', 'tsconfig.check.json'], {
      cwd: rootDir,
      shell: true,
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    let stdout = '';
    let stderr = '';

    tsc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    tsc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    tsc.on('close', (code) => {
      // TypeScript exits with code 2 when there are errors (expected)
      resolve({ stdout, stderr, exitCode: code });
    });

    tsc.on('error', (err) => {
      reject(err);
    });
  });
}

function parseTscOutput(output) {
  const lines = output.split('\n');
  const errors = [];

  // Pattern: src/file.ts(123,45): error TS1234: Message
  const errorPattern = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(errorPattern);
    if (match) {
      const [, filePath, lineNum, colNum, code, message] = match;

      // Normalize path to relative
      const relativePath = path.relative(rootDir, path.resolve(rootDir, filePath))
        .replace(/\\/g, '/');

      errors.push({
        file: relativePath,
        line: parseInt(lineNum, 10),
        column: parseInt(colNum, 10),
        code,
        message: message.trim(),
        severity: 'error',
        tool: 'tsc',
        timestamp: new Date().toISOString()
      });
    }
  }

  return errors;
}

function classifyErrorTier(error) {
  const msg = error.message.toLowerCase();
  const code = error.code;

  // Tier 1: Simple syntax fixes (safe)
  if (
    msg.includes('unterminated') ||
    msg.includes('expected') ||
    msg.includes('unexpected') ||
    code === 'TS1005' || // Expected token
    code === 'TS1003' || // Identifier expected
    code === 'TS1128'    // Declaration expected
  ) {
    return 1;
  }

  // Tier 2: Import/type fixes (moderate)
  if (
    msg.includes('import') ||
    msg.includes('export') ||
    msg.includes('type assertion') ||
    msg.includes('cannot find name') ||
    code === 'TS2307' || // Cannot find module
    code === 'TS2304' || // Cannot find name
    code === 'TS2305' || // Module has no exported member
    code === 'TS2322'    // Type not assignable
  ) {
    return 2;
  }

  // Tier 3: Type mismatches (complex)
  if (
    msg.includes('type') &&
    (msg.includes('not assignable') || msg.includes('incompatible'))
  ) {
    return 3;
  }

  // Tier 4: Everything else
  return 4;
}

async function main() {
  try {
    // 1. Run TypeScript check
    const { stdout, stderr, exitCode } = await runTypeScriptCheck();
    const output = stdout + stderr;

    console.log(`📝 TypeScript check completed (exit code: ${exitCode})\n`);

    // 2. Parse errors
    const errors = parseTscOutput(output);
    console.log(`✅ Parsed ${errors.length} errors\n`);

    if (errors.length === 0) {
      console.log('🎉 No errors found! TypeScript check passed.\n');
      return 0;
    }

    // 3. Classify by tier
    const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    errors.forEach(err => {
      err.tier = classifyErrorTier(err);
      tierCounts[err.tier]++;
    });

    console.log('📊 Error breakdown by tier:');
    console.log(`   Tier 1 (Syntax):      ${tierCounts[1]}`);
    console.log(`   Tier 2 (Import/Type): ${tierCounts[2]}`);
    console.log(`   Tier 3 (Type Logic):  ${tierCounts[3]}`);
    console.log(`   Tier 4 (Complex):     ${tierCounts[4]}\n`);

    // 4. Write to errors.jsonl
    const errorsJsonlPath = path.join(rootDir, 'reports', 'latest', 'errors.jsonl');
    await fs.mkdir(path.dirname(errorsJsonlPath), { recursive: true });

    const jsonlContent = errors.map(err => JSON.stringify(err)).join('\n');
    await fs.writeFile(errorsJsonlPath, jsonlContent, 'utf-8');

    console.log(`✅ Written ${errors.length} errors to: ${path.relative(rootDir, errorsJsonlPath)}\n`);

    // 5. Create summary
    const summary = {
      timestamp: new Date().toISOString(),
      totalErrors: errors.length,
      tierBreakdown: tierCounts,
      topErrorCodes: Object.entries(
        errors.reduce((acc, err) => {
          acc[err.code] = (acc[err.code] || 0) + 1;
          return acc;
        }, {})
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([code, count]) => ({ code, count })),
      topFiles: Object.entries(
        errors.reduce((acc, err) => {
          acc[err.file] = (acc[err.file] || 0) + 1;
          return acc;
        }, {})
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([file, count]) => ({ file, count }))
    };

    const summaryPath = path.join(rootDir, 'reports', 'latest', 'errors-summary.json');
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

    console.log(`✅ Written summary to: ${path.relative(rootDir, summaryPath)}\n`);

    // 6. Show top 5 Tier 2 errors for testing
    const tier2Errors = errors.filter(e => e.tier === 2).slice(0, 5);
    if (tier2Errors.length > 0) {
      console.log('🎯 Sample Tier 2 errors (for KAG testing):');
      tier2Errors.forEach((err, i) => {
        console.log(`   ${i + 1}. ${err.file}:${err.line} - ${err.code}: ${err.message.slice(0, 60)}...`);
      });
      console.log('');
    }

    console.log('🚀 Ready to run factory-fixer with fresh errors!\n');
    console.log('   Next: node scripts/factory-fixer-v2.mjs --apply --tier 2 --limit 20 --verify "cmd /c exit 0"\n');

    return 0;

  } catch (error) {
    console.error('❌ Error:', error.message);
    return 1;
  }
}

main().then(code => process.exit(code));
