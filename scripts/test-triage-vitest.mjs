#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

function nowStamp() {
  const d = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function toPosix(p) {
  return String(p || '').replaceAll('\\', '/');
}

function parseArgs(argv) {
  const args = {
    run: true,
    demo: false,
    outDir: '.tmp/test-triage',
    jsonInput: '',
    consoleInput: '',
    timeoutSec: 900,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--no-run') args.run = false;
    else if (token === '--run') args.run = true;
    else if (token === '--demo') args.demo = true;
    else if (token === '--out-dir' && argv[i + 1]) {
      args.outDir = argv[i + 1];
      i += 1;
    } else if (token === '--json-input' && argv[i + 1]) {
      args.jsonInput = argv[i + 1];
      i += 1;
    } else if (token === '--console-input' && argv[i + 1]) {
      args.consoleInput = argv[i + 1];
      i += 1;
    } else if (token === '--timeout-sec' && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) args.timeoutSec = parsed;
      i += 1;
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    }
  }

  return args;
}

function classifyFailure(message) {
  const text = String(message || '').toLowerCase();

  if (/cannot find module|module not found|err_module_not_found|failed to resolve import/.test(text)) {
    return { category: 'module-resolution', baseScore: 95 };
  }
  if (/syntaxerror|unexpected token|parse error|expected .* but/.test(text)) {
    return { category: 'syntax', baseScore: 92 };
  }
  if (/typescript|ts\d{3,5}|type error|is not assignable|property .* does not exist/.test(text)) {
    return { category: 'type', baseScore: 84 };
  }
  if (/401|403|unauthori[sz]ed|forbidden|permission denied|auth/.test(text)) {
    return { category: 'auth', baseScore: 75 };
  }
  if (/timeout|timed out|econnrefused|network|fetch failed/.test(text)) {
    return { category: 'runtime-network', baseScore: 66 };
  }
  if (/assert|expected|received|toequal|tobe/.test(text)) {
    return { category: 'assertion', baseScore: 48 };
  }
  return { category: 'other', baseScore: 40 };
}

function normalizeMessage(raw) {
  if (Array.isArray(raw)) return raw.join('\n').trim();
  return String(raw || '').trim();
}

function extractFailuresFromVitestJson(report) {
  const items = [];
  const suites = Array.isArray(report?.testResults)
    ? report.testResults
    : Array.isArray(report?.files)
      ? report.files
      : [];

  for (const suite of suites) {
    const file = toPosix(suite?.name || suite?.file || suite?.filepath || 'unknown');
    const assertions = Array.isArray(suite?.assertionResults)
      ? suite.assertionResults
      : Array.isArray(suite?.tests)
        ? suite.tests
        : [];

    if (assertions.length > 0) {
      for (const test of assertions) {
        const status = String(test?.status || '').toLowerCase();
        if (status !== 'failed') continue;
        const message = normalizeMessage(test?.failureMessages || test?.errors || test?.failureMessage || 'Unknown failure');
        const title = String(test?.fullName || test?.name || suite?.name || 'unknown test');
        items.push({ file, title, message });
      }
      continue;
    }

    const status = String(suite?.status || '').toLowerCase();
    if (status === 'failed') {
      const message = normalizeMessage(suite?.message || suite?.error || suite?.errors || 'Unknown suite failure');
      const title = String(suite?.name || 'failed suite');
      items.push({ file, title, message });
    }
  }

  return items;
}

function extractFailuresFromConsole(logText) {
  const rows = [];
  const lines = String(logText || '').split(/\r?\n/);
  let currentFile = 'unknown';
  let lastTestLine = 'console failure';

  function nearbyFile(index) {
    const start = Math.max(0, index - 4);
    for (let j = index; j >= start; j -= 1) {
      const probe = lines[j] || '';
      const m = probe.match(/((?:tests|src)\/[\w./\-\[\]]+\.(?:test|spec)\.[cm]?[jt]s)/i);
      if (m) return toPosix(m[1]);
    }
    return null;
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] || '';
    const failMatch = line.match(/\bFAIL\b\s+(.+)$/);
    if (failMatch) {
      currentFile = toPosix(failMatch[1].trim());
    }

    if (/\s>\s.+/.test(line) && /\d+ms\s*$/.test(line)) {
      const normalized = line.replace(/^[^A-Za-z0-9]+/, '').trim();
      lastTestLine = normalized;
      const fileMatch = normalized.match(/^([^>]+?)\s+>/);
      if (fileMatch) {
        const maybeFile = toPosix(fileMatch[1].trim());
        if (/\.(test|spec)\.[cm]?[jt]s$/.test(maybeFile)) {
          currentFile = maybeFile;
        }
      }
    }

    if (/\btest timed out\b|\bhook timed out\b/i.test(line)) {
      const resolvedFile = currentFile !== 'unknown' ? currentFile : (nearbyFile(i) || 'unknown');
      rows.push({
        file: resolvedFile,
        title: lastTestLine,
        message: line.trim(),
      });
      continue;
    }

    if (/\bexpected .* not to be null\b|\bcannot read properties of null\b/i.test(line)) {
      const resolvedFile = currentFile !== 'unknown' ? currentFile : (nearbyFile(i) || 'unknown');
      rows.push({
        file: resolvedFile,
        title: lastTestLine,
        message: line.trim(),
      });
      continue;
    }

    if (/\b(Error|AssertionError|TypeError|ReferenceError|SyntaxError):\b/.test(line)) {
      const message = line.trim();
      const next = (lines[i + 1] || '').trim();
      rows.push({
        file: currentFile,
        title: next && !next.startsWith('at ') ? next : 'console failure',
        message,
      });
    }
  }

  return rows;
}

function rankFailures(rawFailures) {
  const fileCounts = new Map();
  for (const failure of rawFailures) {
    fileCounts.set(failure.file, (fileCounts.get(failure.file) || 0) + 1);
  }

  return rawFailures
    .map((failure) => {
      const { category, baseScore } = classifyFailure(failure.message);
      const inFileCount = fileCounts.get(failure.file) || 1;
      const frequencyBoost = Math.min((inFileCount - 1) * 4, 16);
      const apiRouteBoost = /\/routes\/api\//.test(failure.file) ? 6 : 0;
      const gatewayBoost = /\/gateway\//.test(failure.file) ? 5 : 0;
      const score = Math.max(0, Math.min(100, baseScore + frequencyBoost + apiRouteBoost + gatewayBoost));
      return {
        ...failure,
        category,
        score,
        inFileCount,
      };
    })
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.title.localeCompare(b.title));
}

function toCsv(rows) {
  const escape = (v) => {
    const str = String(v ?? '');
    if (/[,"\n]/.test(str)) return `"${str.replaceAll('"', '""')}"`;
    return str;
  };
  const header = ['score', 'category', 'file', 'test', 'message'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      row.score,
      row.category,
      row.file,
      row.title,
      (row.message || '').split('\n')[0],
    ].map(escape).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function toMarkdown(summary) {
  const lines = [];
  lines.push('# Vitest Triage Summary');
  lines.push('');
  lines.push(`- generatedAt: ${summary.generatedAt}`);
  lines.push(`- totalFailures: ${summary.totalFailures}`);
  lines.push(`- exitCode: ${summary.exitCode}`);
  lines.push('');
  lines.push('## Top Failures (0-100)');
  lines.push('');

  const top = summary.failures.slice(0, 30);
  for (const f of top) {
    lines.push(`- [${f.score}] ${f.category} | ${f.file} | ${f.title}`);
  }

  return `${lines.join('\n')}\n`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runVitestAndCollect(reportJsonFile, logFile, timeoutSec) {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32'
      ? 'npm run test:run -- --reporter=verbose --reporter=json --outputFile="' + toPosix(reportJsonFile) + '"'
      : 'npm';
    const args = process.platform === 'win32'
      ? []
      : ['run', 'test:run', '--', '--reporter=verbose', '--reporter=json', `--outputFile=${toPosix(reportJsonFile)}`];

    const child = spawn(cmd, args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    const chunks = [];
    let timedOut = false;
    let resolved = false;

    const timeoutMs = Math.max(1, Number(timeoutSec || 900)) * 1000;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
      } catch {
        // no-op
      }

      // Some npm/vitest trees on Windows may ignore SIGTERM; force kill and finalize.
      setTimeout(() => {
        if (resolved) return;
        try {
          child.kill('SIGKILL');
        } catch {
          // no-op
        }
        finalize(124, new Error('Timed out waiting for vitest process to exit'));
      }, 3000);
    }, timeoutMs);

    function finalize(code, spawnError) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      const outputText = chunks.join('');
      fs.writeFileSync(logFile, outputText, 'utf8');
      resolve({
        exitCode: Number.isInteger(code) ? code : 1,
        timedOut,
        outputText,
        spawnError: spawnError ? String(spawnError?.message || spawnError) : null,
      });
    }

    child.stdout.on('data', (buf) => {
      const text = String(buf);
      process.stdout.write(text);
      chunks.push(text);
    });

    child.stderr.on('data', (buf) => {
      const text = String(buf);
      process.stderr.write(text);
      chunks.push(text);
    });

    child.on('error', (error) => finalize(1, error));
    child.on('close', (code) => finalize(code, null));
  });
}

function getDemoReport() {
  return {
    testResults: [
      {
        name: 'src/tests/gateway/flow-enforcer.test.ts',
        assertionResults: [
          {
            status: 'failed',
            fullName: 'FlowEnforcer blocks stale transitions',
            failureMessages: ['Error: Cannot find module \"$lib/server/gateway/state-manager\"'],
          },
        ],
      },
      {
        name: 'src/tests/routes/cases-auth-evidence-routes.spec.ts',
        assertionResults: [
          {
            status: 'failed',
            fullName: 'returns 401 when session missing',
            failureMessages: ['AssertionError: expected 200 to be 401'],
          },
        ],
      },
    ],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/test-triage-vitest.mjs [--run|--no-run] [--json-input <file>] [--console-input <file>] [--out-dir <dir>] [--timeout-sec <n>] [--demo]');
    process.exit(0);
  }

  const stamp = nowStamp();
  const baseDir = path.resolve(args.outDir);
  const runDir = path.join(baseDir, stamp);
  ensureDir(runDir);

  const reportJsonFile = path.join(runDir, 'vitest-report.json');
  const consoleLogFile = path.join(runDir, 'vitest-console.log');

  let exitCode = 0;
  let timedOut = false;
  let runOutputText = '';
  let spawnError = null;
  if (args.run && !args.demo && !args.jsonInput) {
    const runResult = await runVitestAndCollect(reportJsonFile, consoleLogFile, args.timeoutSec);
    exitCode = runResult.exitCode;
    timedOut = Boolean(runResult.timedOut);
    runOutputText = runResult.outputText || '';
    spawnError = runResult.spawnError;
  }

  let report = null;
  let consoleInputText = '';
  if (args.demo) {
    report = getDemoReport();
    writeJson(reportJsonFile, report);
    fs.writeFileSync(consoleLogFile, 'demo run\n', 'utf8');
  } else if (args.jsonInput) {
    report = JSON.parse(fs.readFileSync(path.resolve(args.jsonInput), 'utf8'));
  } else if (fs.existsSync(reportJsonFile)) {
    report = JSON.parse(fs.readFileSync(reportJsonFile, 'utf8'));
  }

  if (args.consoleInput) {
    const consolePath = path.resolve(args.consoleInput);
    if (fs.existsSync(consolePath)) {
      consoleInputText = fs.readFileSync(consolePath, 'utf8');
    }
  }

  const fromJson = report ? extractFailuresFromVitestJson(report) : [];
  const consoleText = consoleInputText || runOutputText || (fs.existsSync(consoleLogFile) ? fs.readFileSync(consoleLogFile, 'utf8') : '');
  const fromConsole = fromJson.length === 0 ? extractFailuresFromConsole(consoleText) : [];
  const failures = rankFailures(fromJson.length > 0 ? fromJson : fromConsole);

  const summary = {
    generatedAt: new Date().toISOString(),
    exitCode,
    timedOut,
    spawnError,
    totalFailures: failures.length,
    byCategory: failures.reduce((acc, f) => {
      acc[f.category] = (acc[f.category] || 0) + 1;
      return acc;
    }, {}),
    hotspots: Object.entries(failures.reduce((acc, f) => {
      acc[f.file] = (acc[f.file] || 0) + 1;
      return acc;
    }, {}))
      .map(([file, count]) => ({ file, count }))
      .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file))
      .slice(0, 30),
    failures,
  };

  const summaryJson = path.join(runDir, 'ranked-failures.json');
  const summaryCsv = path.join(runDir, 'ranked-failures.csv');
  const summaryMd = path.join(runDir, 'summary.md');
  const latestFile = path.join(baseDir, 'latest.json');

  writeJson(summaryJson, summary);
  fs.writeFileSync(summaryCsv, toCsv(failures), 'utf8');
  fs.writeFileSync(summaryMd, toMarkdown(summary), 'utf8');

  writeJson(latestFile, {
    runDir: toPosix(path.relative(process.cwd(), runDir)),
    summaryJson: toPosix(path.relative(process.cwd(), summaryJson)),
    summaryCsv: toPosix(path.relative(process.cwd(), summaryCsv)),
    summaryMd: toPosix(path.relative(process.cwd(), summaryMd)),
    reportJson: toPosix(path.relative(process.cwd(), reportJsonFile)),
    consoleLog: toPosix(path.relative(process.cwd(), consoleLogFile)),
    generatedAt: summary.generatedAt,
    totalFailures: summary.totalFailures,
    exitCode: summary.exitCode,
  });

  const top = failures[0];
  const compact = top
    ? `TRIAGE fail=${failures.length} top=${top.score} ${top.category} ${top.file}`
    : `TRIAGE fail=0 exit=${exitCode}`;

  console.log(compact);
  console.log(`Artifacts: ${toPosix(path.relative(process.cwd(), runDir))}`);

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

main().catch((error) => {
  console.error('test-triage-vitest failed:', error);
  process.exit(1);
});
