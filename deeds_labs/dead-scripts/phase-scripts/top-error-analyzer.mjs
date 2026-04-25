#!/usr/bin/env node

/**
 * Top Error Analyzer
 * ------------------
 * Runs `svelte-check --output machine`, aggregates diagnostics, and emits:
 *   • Top N files sorted by error density (defaults to 100)
 *   • Pattern summary grouped by diagnostic code/message
 * Optionally pushes the top files through the SIMD JSON microservice so the
 * AST-repair phase already has structured payloads waiting in Redis/JSON files.
 */

import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const { values: args } = parseArgs({
  options: {
    top: { type: 'string', default: '100' },
    output: { type: 'string', default: 'error-top100.json' },
    log: { type: 'string', default: 'svelte-check-machine.ndjson' },
    'simd-endpoint': { type: 'string' },
    'simd-output': { type: 'string', default: 'simd-top-files.json' },
    'max-samples-per-file': { type: 'string', default: '5' }
  }
});

const config = {
  topN: Math.max(1, parseInt(args.top, 10) || 100),
  outputPath: path.resolve(ROOT, args.output),
  machineLogPath: path.resolve(ROOT, args.log),
  simdEndpoint: args['simd-endpoint'] || process.env.SIMD_ENDPOINT || '',
  simdOutputPath: path.resolve(ROOT, args['simd-output']),
  maxSamplesPerFile: Math.max(1, parseInt(args['max-samples-per-file'], 10) || 5)
};

const diagTotals = {
  totalDiagnostics: 0,
  totalFilesWithErrors: 0
};

const fileStats = new Map();
const patternStats = new Map();
const plainMachineRegex =
  /^(\d+)\s+(ERROR|WARN|INFO)\s+"([^"]+)"\s+(\d+):(\d+)\s+"([\s\S]+)"$/;

function normalizeFilePath(filePath) {
  if (!filePath) return 'unknown';
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  return path.relative(ROOT, absolute).replace(/\\/g, '/');
}

function parsePlainDiagnostic(line) {
  const match = plainMachineRegex.exec(line);
  if (!match) return null;
  const [, , level, file, lineNum, colNum, message] = match;
  const codeMatch = message.match(/TS(\d+)/i);
  return {
    type: level.toLowerCase(),
    file,
    message,
    code: codeMatch ? `TS${codeMatch[1]}` : undefined,
    range: {
      start: { line: Number(lineNum), character: Number(colNum) },
      end: { line: Number(lineNum), character: Number(colNum) }
    }
  };
}

function recordDiagnostic(diag) {
  const relFile = normalizeFilePath(diag.file);
  diagTotals.totalDiagnostics += 1;

  if (!fileStats.has(relFile)) {
    fileStats.set(relFile, {
      file: relFile,
      count: 0,
      samples: [],
      codes: new Map()
    });
  }

  const perFile = fileStats.get(relFile);
  perFile.count += 1;
  if (perFile.samples.length < config.maxSamplesPerFile) {
    perFile.samples.push({
      code: diag.code || diag.message,
      message: diag.message,
      range: diag.range
    });
  }

  const codeKey = diag.code || diag.message || 'unknown';
  perFile.codes.set(codeKey, (perFile.codes.get(codeKey) || 0) + 1);

  if (!patternStats.has(codeKey)) {
    patternStats.set(codeKey, {
      code: codeKey,
      count: 0,
      files: new Map()
    });
  }
  const pattern = patternStats.get(codeKey);
  pattern.count += 1;
  pattern.files.set(relFile, (pattern.files.get(relFile) || 0) + 1);
}

async function runSvelteCheck() {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? 'cmd.exe' : 'npx';
    const commandArgs = process.platform === 'win32'
      ? ['/c', 'npx', 'svelte-check', '--output', 'machine']
      : ['svelte-check', '--output', 'machine'];

    const proc = spawn(command, commandArgs, {
      cwd: ROOT,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';
    const logStream = [];

    const handleChunk = (chunk, isStdout) => {
      const buffer = (isStdout ? stdoutBuffer : stderrBuffer) + chunk.toString();
      const lines = buffer.split(/\r?\n/);
      if (isStdout) {
        stdoutBuffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          logStream.push(line);
          let handled = false;
          try {
            const diag = JSON.parse(line);
            if (diag.type === 'diagnostic') {
              recordDiagnostic(diag);
              handled = true;
            }
          } catch {
            const plain = parsePlainDiagnostic(line);
            if (plain) {
              recordDiagnostic(plain);
              handled = true;
            }
          }

          if (!handled) {
            // leave as log-only line
          }
        }
      } else {
        stderrBuffer = lines.pop() ?? '';
        lines.forEach((line) => line && logStream.push(`stderr: ${line}`));
      }
    };

    proc.stdout.on('data', (chunk) => handleChunk(chunk, true));
    proc.stderr.on('data', (chunk) => handleChunk(chunk, false));

    proc.on('close', async (code) => {
      if (stdoutBuffer.trim()) {
        logStream.push(stdoutBuffer.trim());
      }
      if (stderrBuffer.trim()) {
        logStream.push(`stderr: ${stderrBuffer.trim()}`);
      }

      await fs.writeFile(config.machineLogPath, logStream.join('\n'), 'utf8');
      diagTotals.totalFilesWithErrors = fileStats.size;

      if (code !== 0 && code !== 1) {
        reject(new Error(`svelte-check exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

function buildTopSummaries() {
  const filesSorted = [...fileStats.values()].sort((a, b) => b.count - a.count);
  const topFiles = filesSorted.slice(0, config.topN).map((entry, index) => {
    const dominantCodes = [...entry.codes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([code, count]) => ({ code, count }));

    return {
      rank: index + 1,
      file: entry.file,
      totalErrors: entry.count,
      dominantCodes,
      samples: entry.samples
    };
  });

  const patternsSorted = [...patternStats.values()].sort((a, b) => b.count - a.count);
  const patterns = patternsSorted.map((pattern) => ({
    code: pattern.code,
    total: pattern.count,
    topFiles: [...pattern.files.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([file, count]) => ({ file, count }))
  }));

  return { topFiles, patterns };
}

async function sendFilesToSimd(topFiles) {
  if (!config.simdEndpoint) {
    return [];
  }

  const simdPayloads = [];
  for (const file of topFiles) {
    const absolute = path.resolve(ROOT, file.file);
    try {
      const content = await fs.readFile(absolute, 'utf8');
      const body = JSON.stringify({ filePath: file.file, content });
      const response = await fetch(config.simdEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const parsed = await response.json();
      simdPayloads.push({ file: file.file, result: parsed });
      console.log(`SIMD ✓ ${file.file}`);
    } catch (error) {
      console.warn(`SIMD ✗ ${file.file}: ${error.message}`);
    }
  }

  if (simdPayloads.length > 0) {
    await fs.writeFile(config.simdOutputPath, JSON.stringify(simdPayloads, null, 2), 'utf8');
  }

  return simdPayloads;
}

async function main() {
  console.log(`▶ Running svelte-check (top ${config.topN})...`);
  await runSvelteCheck();

  const { topFiles, patterns } = buildTopSummaries();

  const report = {
    generatedAt: new Date().toISOString(),
    totals: diagTotals,
    config: {
      topN: config.topN,
      machineLogPath: path.relative(ROOT, config.machineLogPath),
      simdEndpoint: config.simdEndpoint || null
    },
    files: topFiles,
    patterns
  };

  await fs.writeFile(config.outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`✔ Wrote ${path.relative(ROOT, config.outputPath)}`);

  if (config.simdEndpoint) {
    console.log(`▶ Sending top files to SIMD microservice ${config.simdEndpoint}`);
    await sendFilesToSimd(topFiles);
  }

  console.log('Summary:');
  console.log(`  Diagnostics: ${diagTotals.totalDiagnostics}`);
  console.log(`  Files w/ errors: ${diagTotals.totalFilesWithErrors}`);
  console.log(
    `  Worst file: ${topFiles[0]?.file || 'n/a'} (${topFiles[0]?.totalErrors ?? 0} errors)`
  );
}

main().catch((error) => {
  console.error('Top Error Analyzer failed:', error);
  process.exitCode = 1;
});
