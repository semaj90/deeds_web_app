#!/usr/bin/env node
/**
 * VS Code Extension Performance Log
 * Read-only diagnostic script — no writes to source files, no secrets printed,
 * no CUDA, no PyTorch, no repo indexing.
 *
 * Usage:
 *   node scripts/vscode-extension-performance-log.mjs
 *   node scripts/vscode-extension-performance-log.mjs --publish
 */

import { spawnSync } from 'node:child_process';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Constants ─────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PUBLISH = process.argv.includes('--publish');

const GENERATED_FOLDERS_TO_CHECK = [
  'node_modules', '.svelte-kit', '.vite', 'dist', 'build', '.tmp', 'logs', 'coverage',
];

const WATCHER_EXCLUDE_REQUIRED = [
  'node_modules', '.svelte-kit', '.vite', 'dist', 'build', '.tmp', 'logs', 'coverage',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) {
  process.stderr.write(`[vscode-perf] ${msg}\n`);
}

function spawnOut(cmd, args, cwd = ROOT) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
    shell: process.platform === 'win32',
  });
  return {
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    status: result.status ?? -1,
    error: result.error ? result.error.message : null,
  };
}

/** Mask all values from env vars to prevent secret leakage. */
function maskSecrets(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const masked = {};
  for (const [k, v] of Object.entries(obj)) {
    const upper = k.toUpperCase();
    if (
      upper.includes('KEY') || upper.includes('SECRET') || upper.includes('PASSWORD') ||
      upper.includes('TOKEN') || upper.includes('PASS') || upper.includes('CREDENTIAL')
    ) {
      masked[k] = '***MASKED***';
    } else {
      masked[k] = maskSecrets(v);
    }
  }
  return masked;
}

/** Minimal JSONC → JSON stripper: removes // line comments and trailing commas
 *  before ] or }.  Handles VS Code settings.json / tasks.json without a dep. */
function stripJsonc(raw) {
  // 1. Remove // comments (not inside strings — good-enough for VS Code files)
  let s = raw.replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*/g, (m, str) => str ?? '');
  // 2. Remove trailing commas before ] or }
  s = s.replace(/,(\s*[}\]])/g, '$1');
  return s;
}

/** Read a JSON/JSONC file, returning null on any error. */
async function readJson(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(stripJsonc(raw));
  } catch {
    return null;
  }
}

/** Get folder size in MB (or a package count for node_modules).
 *  Full recursive scans of node_modules on Windows NTFS take 60-120s — we
 *  never do that.  Strategy:
 *   - node_modules: count top-level package directories (fast, ~100ms)
 *   - everything else: recursive file-size sum with a 12s timeout
 *  Returns a number (MB), { pkgCount: N }, or null. */
async function folderSizeMb(folderPath) {
  if (!existsSync(folderPath)) return null;

  // Normalise to backslashes for PowerShell LiteralPath
  const winPath = folderPath.replace(/[/\\]+/g, '\\').replace(/\\$/, '');

  // Special-case node_modules: count top-level package dirs (fast, meaningful)
  const base = winPath.split('\\').pop() ?? '';
  if (base === 'node_modules') {
    const ps = spawnSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `(Get-ChildItem -LiteralPath '${winPath}' -Force -ErrorAction SilentlyContinue).Count`,
    ], { encoding: 'utf8', timeout: 8000, shell: false });
    if (ps.status === 0 && ps.stdout && !isNaN(Number(ps.stdout.trim()))) {
      return { pkgCount: Number(ps.stdout.trim()) };
    }
    return null;
  }

  // For other folders: recursive file-size sum (fast for small dirs like .tmp, logs, .svelte-kit)
  const ps = spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    `[math]::Round((Get-ChildItem -LiteralPath '${winPath}' -Force -File -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB)`,
  ], { encoding: 'utf8', timeout: 12000, shell: false });
  if (ps.status === 0 && ps.stdout && !isNaN(Number(ps.stdout.trim()))) {
    return Number(ps.stdout.trim());
  }

  return null;
}

// ── Step 1: VS Code version + extensions ─────────────────────────────────────

log('Querying VS Code version and extensions…');

const versionResult = spawnOut('code', ['--version']);
const vscodeVersion = versionResult.status === 0
  ? versionResult.stdout.split('\n')[0].trim()
  : `ERROR: ${versionResult.error || versionResult.stderr || 'exit ' + versionResult.status}`;

const extResult = spawnOut('code', ['--list-extensions', '--show-versions']);
const extensions = extResult.status === 0
  ? extResult.stdout.split('\n').filter(Boolean).map(line => {
      const [id, version] = line.split('@');
      return { id: id.trim(), version: (version || '').trim() };
    })
  : [];

if (extResult.status !== 0) {
  log(`WARN: could not list extensions — ${extResult.error || extResult.stderr}`);
}

// ── Step 2: Parse VS Code config files ───────────────────────────────────────

log('Reading .vscode/settings.json…');
const settingsPath = resolve(ROOT, '.vscode', 'settings.json');
const settings = await readJson(settingsPath);

log('Reading .vscode/tasks.json…');
const tasksPath = resolve(ROOT, '.vscode', 'tasks.json');
const tasks = await readJson(tasksPath);

log('Reading package.json scripts…');
const pkgPath = resolve(ROOT, 'package.json');
const pkg = await readJson(pkgPath);
const scripts = pkg?.scripts ?? {};

// ── Step 3: Issue detection ───────────────────────────────────────────────────

const issues = [];

// 3a. folderOpen tasks
const folderOpenTasks = [];
if (tasks && Array.isArray(tasks.tasks)) {
  for (const task of tasks.tasks) {
    if (task.runOptions && task.runOptions.runOn === 'folderOpen') {
      const cmd = typeof task.command === 'string'
        ? task.command
        : JSON.stringify(task.command ?? '');
      folderOpenTasks.push({ label: task.label ?? '(no label)', command: cmd.substring(0, 200) });
      issues.push({
        severity: 'warn',
        category: 'folderOpen-task',
        message: `Task "${task.label}" runs on folder open — startup-cost landmine`,
        detail: cmd.substring(0, 200),
      });
    }
  }
}

// 3b. Duplicate npm script names
const scriptNames = Object.keys(scripts);
const seen = new Set();
const dupes = new Set();
for (const name of scriptNames) {
  if (seen.has(name)) dupes.add(name);
  seen.add(name);
}
for (const name of dupes) {
  issues.push({
    severity: 'warn',
    category: 'duplicate-script',
    message: `Duplicate npm script name: "${name}"`,
    detail: 'package.json scripts object has duplicate keys',
  });
}

// 3c. python.defaultInterpreterPath → WindowsApps
if (settings) {
  const pyPath = settings['python.defaultInterpreterPath'] ?? '';
  if (typeof pyPath === 'string' && pyPath.toLowerCase().includes('windowsapps')) {
    issues.push({
      severity: 'warn',
      category: 'python-interpreter',
      message: 'python.defaultInterpreterPath points to WindowsApps — triggers Windows Store redirect',
      detail: pyPath,
    });
  }

  // 3d. python-envs.pythonProjects
  if ('python-envs.pythonProjects' in settings) {
    issues.push({
      severity: 'info',
      category: 'python-envs',
      message: 'python-envs.pythonProjects is present in settings.json — can slow down Python env scanning',
      detail: JSON.stringify(settings['python-envs.pythonProjects']).substring(0, 200),
    });
  }

  // 3e. terminal.integrated.gpuAcceleration not "on"
  const gpuAccel = settings['terminal.integrated.gpuAcceleration'];
  if (gpuAccel !== 'on') {
    issues.push({
      severity: 'info',
      category: 'gpu-acceleration',
      message: `terminal.integrated.gpuAcceleration is "${gpuAccel ?? '(unset)'}" — recommend setting to "on"`,
      detail: 'Set "terminal.integrated.gpuAcceleration": "on" in .vscode/settings.json',
    });
  }
}

// 3f. missing files.watcherExclude
const watcherExcludePresent = settings ? 'files.watcherExclude' in settings : false;
if (!watcherExcludePresent) {
  issues.push({
    severity: 'warn',
    category: 'watcher-exclude',
    message: 'files.watcherExclude is missing from .vscode/settings.json — file watcher will scan all folders',
    detail: 'Add files.watcherExclude with node_modules, .svelte-kit, dist, build, .tmp, logs, coverage',
  });
}

// 3g. missing search.exclude
const searchExcludePresent = settings ? 'search.exclude' in settings : false;
if (!searchExcludePresent) {
  issues.push({
    severity: 'warn',
    category: 'search-exclude',
    message: 'search.exclude is missing from .vscode/settings.json — search will index generated folders',
    detail: 'Add search.exclude with node_modules, .svelte-kit, dist, build, .tmp, logs, coverage',
  });
}

// 3h. Generated folders not in watcherExclude
const missingFromWatcherExclude = [];
if (watcherExcludePresent && settings) {
  const watcherKeys = Object.keys(settings['files.watcherExclude'] ?? {}).join(' ');
  for (const folder of WATCHER_EXCLUDE_REQUIRED) {
    // Check if the folder name appears in any key pattern
    if (!watcherKeys.includes(folder)) {
      missingFromWatcherExclude.push(folder);
    }
  }
  if (missingFromWatcherExclude.length > 0) {
    issues.push({
      severity: 'info',
      category: 'watcher-exclude-gaps',
      message: `Generated folders not in files.watcherExclude: ${missingFromWatcherExclude.join(', ')}`,
      detail: 'Add these patterns to files.watcherExclude to reduce watcher overhead',
    });
  }
}

// ── Step 4: Folder size checks ────────────────────────────────────────────────

log('Checking folder sizes…');
const folderSizes = {};

// Check both repo root and sveltekit-frontend subdirectory for each
const folderRoots = [ROOT, resolve(ROOT, 'sveltekit-frontend')];

for (const folder of GENERATED_FOLDERS_TO_CHECK) {
  let totalMb = null;
  let totalPkgs = null;
  for (const base of folderRoots) {
    const candidate = resolve(base, folder);
    if (existsSync(candidate)) {
      log(`  Measuring ${candidate}…`);
      const result = await folderSizeMb(candidate);
      if (result !== null) {
        if (typeof result === 'object' && result.pkgCount !== undefined) {
          totalPkgs = (totalPkgs ?? 0) + result.pkgCount;
        } else if (typeof result === 'number') {
          totalMb = (totalMb ?? 0) + result;
        }
      }
    }
  }
  // Store pkg count as a string "N pkgs" so JSON shape stays consistent
  folderSizes[folder] = totalPkgs !== null ? `${totalPkgs} pkgs` : totalMb;
}

// ── Step 5: Git checks ────────────────────────────────────────────────────────

log('Running git checks…');

const branchResult = spawnOut('git', ['branch', '--show-current']);
const branch = branchResult.status === 0 ? branchResult.stdout : '(unknown)';

const statusResult = spawnOut('git', ['status', '--porcelain']);
const dirtyFileCount = statusResult.status === 0
  ? statusResult.stdout.split('\n').filter(Boolean).length
  : -1;

// ── Step 6: Assemble report ───────────────────────────────────────────────────

const report = {
  generatedAt: new Date().toISOString(),
  vscode: {
    version: vscodeVersion,
    extensionCount: extensions.length,
    extensions,
  },
  issues,
  folderOpenTasks,
  folderSizes,
  git: {
    branch,
    dirtyFileCount,
  },
  watcherExcludePresent,
  searchExcludePresent,
  missingFromWatcherExclude,
};

// ── Step 7: Write outputs ─────────────────────────────────────────────────────

// Ensure .tmp and reports dirs exist
const tmpDir = resolve(ROOT, '.tmp');
const reportsDir = resolve(ROOT, 'reports');
await mkdir(tmpDir, { recursive: true });
await mkdir(reportsDir, { recursive: true });

const jsonOutPath = resolve(tmpDir, 'vscode-extension-performance-log.json');
const mdOutPath = resolve(reportsDir, 'vscode-extension-performance-log.md');

log(`Writing JSON → ${jsonOutPath}`);
await writeFile(jsonOutPath, JSON.stringify(report, null, 2), 'utf8');

// Build markdown report
const warnCount = issues.filter(i => i.severity === 'warn').length;
const infoCount = issues.filter(i => i.severity === 'info').length;

const folderSizeRows = Object.entries(folderSizes)
  .map(([folder, val]) => {
    if (val === null) return `| \`${folder}\` | — (not found) |`;
    if (typeof val === 'string') return `| \`${folder}\` | ${val} |`;
    const flag = val > 500 ? ' ⚠️' : '';
    return `| \`${folder}\` | ${val} MB${flag} |`;
  })
  .join('\n');

const issueRows = issues.length === 0
  ? '_No issues found._'
  : issues.map(i => {
      const icon = i.severity === 'warn' ? '⚠️' : 'ℹ️';
      return `### ${icon} \`${i.category}\`\n**${i.message}**\n\n> ${i.detail}`;
    }).join('\n\n---\n\n');

const folderOpenRows = folderOpenTasks.length === 0
  ? '_None_'
  : folderOpenTasks.map(t =>
      `| ${t.label} | \`${t.command.replace(/\|/g, '\\|').substring(0, 100)}\` |`
    ).join('\n');

const extRows = extensions.slice(0, 30).map(e => `| \`${e.id}\` | ${e.version} |`).join('\n');
const extTruncNote = extensions.length > 30 ? `\n\n_…and ${extensions.length - 30} more extensions._` : '';

const md = `# VS Code Extension Performance Log

**Generated:** ${report.generatedAt}
**Branch:** \`${branch}\` | **Dirty files:** ${dirtyFileCount < 0 ? '(unknown)' : dirtyFileCount}
**VS Code:** ${vscodeVersion}
**Extensions installed:** ${extensions.length}

---

## Summary

| Category | Count |
|---|---|
| Warnings | ${warnCount} |
| Info notices | ${infoCount} |
| Folder-open tasks | ${folderOpenTasks.length} |
| \`files.watcherExclude\` present | ${watcherExcludePresent ? '✅ Yes' : '❌ No'} |
| \`search.exclude\` present | ${searchExcludePresent ? '✅ Yes' : '❌ No'} |
| Missing from watcherExclude | ${missingFromWatcherExclude.length === 0 ? '✅ None' : missingFromWatcherExclude.join(', ')} |

---

## Folder-Open Tasks (startup-cost landmines)

| Label | Command |
|---|---|
${folderOpenRows}

---

## Folder Sizes

| Folder | Size |
|---|---|
${folderSizeRows}

---

## Issues

${issueRows}

---

## Installed Extensions (first 30)

| Extension | Version |
|---|---|
${extRows}${extTruncNote}

---

_JSON output: \`.tmp/vscode-extension-performance-log.json\`_
`;

log(`Writing markdown → ${mdOutPath}`);
await writeFile(mdOutPath, md, 'utf8');

// ── Step 8: Optional Redis publish ───────────────────────────────────────────

if (PUBLISH) {
  log('--publish flag detected — connecting to Redis…');
  let Redis;
  try {
    ({ default: Redis } = await import('ioredis'));
  } catch {
    process.stderr.write('[vscode-perf] WARN: ioredis not available — skipping publish\n');
    process.exit(0);
  }

  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {}); // suppress unhandled error events

  try {
    await redis.connect();
    await redis.ping();
    const key = 'ace:vscode:performance:latest';
    const value = JSON.stringify(maskSecrets(report));
    await redis.setex(key, 86400, value);
    log(`Published to Redis key "${key}" (TTL 86400s)`);
  } catch (err) {
    process.stderr.write(`[vscode-perf] WARN: Redis publish failed — ${err.message}\n`);
  } finally {
    redis.disconnect();
  }
}

// ── Done ──────────────────────────────────────────────────────────────────────

log('Done.');
log(`  JSON  → .tmp/vscode-extension-performance-log.json`);
log(`  MD    → reports/vscode-extension-performance-log.md`);
log(`  Issues: ${warnCount} warnings, ${infoCount} info`);
log(`  Folder-open tasks: ${folderOpenTasks.length}`);
