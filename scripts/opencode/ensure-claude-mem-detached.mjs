#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';

function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    const pkg = path.join(dir, 'package.json');
    const ace = path.join(dir, 'scripts', 'opencode', 'get-ace-context.mjs');
    if (fs.existsSync(pkg) && fs.existsSync(ace)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(startDir);
    dir = parent;
  }
}

function readJsonIfExists(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function getRuntimePreference(argv, env) {
  const wantsServerBeta = argv.includes('--server-beta') || (env.CLAUDE_MEM_RUNTIME ?? '').trim() === 'server-beta';
  const wantsWorker = argv.includes('--worker') || (env.CLAUDE_MEM_RUNTIME ?? '').trim() === 'worker';
  const hasServerBetaDb = Boolean((env.CLAUDE_MEM_SERVER_DATABASE_URL ?? '').trim());
  if (argv.includes('--server-beta')) {
    return hasServerBetaDb
      ? { runtime: 'server-beta', reason: 'forced by CLI flag --server-beta' }
      : { runtime: 'worker', reason: 'requested server-beta but CLAUDE_MEM_SERVER_DATABASE_URL is missing; falling back to worker' };
  }
  if (argv.includes('--worker')) {
    return { runtime: 'worker', reason: 'forced by CLI flag --worker' };
  }
  if (wantsServerBeta && hasServerBetaDb) {
    return { runtime: 'server-beta', reason: 'CLAUDE_MEM_RUNTIME=server-beta and database URL is configured' };
  }
  if (wantsServerBeta && !hasServerBetaDb) {
    return { runtime: 'worker', reason: 'CLAUDE_MEM_RUNTIME=server-beta but database URL is missing; falling back to worker' };
  }
  if (hasServerBetaDb && !wantsWorker) {
    return { runtime: 'server-beta', reason: 'database URL detected; preferring server-beta' };
  }
  return { runtime: 'worker', reason: wantsWorker ? 'CLAUDE_MEM_RUNTIME=worker' : 'defaulting to legacy worker runtime' };
}

function getRuntimeScript(runtime) {
  if (runtime === 'server-beta') {
    return 'plugin/scripts/server-beta-service.cjs';
  }
  return 'plugin/scripts/worker-service.cjs';
}

function runStatus(bunBin, claudeMemRoot, runtime) {
  const script = getRuntimeScript(runtime);
  const env = {
    ...process.env,
    CLAUDE_MEM_RUNTIME: runtime,
  };
  const result = spawnSync(bunBin, [script, 'status'], {
    cwd: claudeMemRoot,
    encoding: 'utf8',
    env,
    shell: process.platform === 'win32',
    timeout: 30000,
  });
  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();
  const running = /Worker is running/i.test(stdout);
  return {
    ok: result.status === 0,
    running,
    status: result.status,
    stdout,
    stderr,
  };
}

function launchDetached(bunBin, claudeMemRoot, runtime) {
  const script = getRuntimeScript(runtime);
  const child = spawn(bunBin, [script, 'start'], {
    cwd: claudeMemRoot,
    detached: true,
    env: {
      ...process.env,
      CLAUDE_MEM_RUNTIME: runtime,
    },
    shell: false,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  return {
    ok: Boolean(child.pid),
    status: child.pid ? 0 : 1,
    pid: child.pid ?? null,
    stdout: '',
    stderr: '',
  };
}

async function main() {
  const repoRoot = findRepoRoot(process.cwd());
  const claudeMemRoot = path.join(repoRoot, 'claude-mem');
  const bunBin = process.env.BUN_BIN || 'bun';
  const tmpDir = path.join(repoRoot, '.tmp');
  const reportsDir = path.join(repoRoot, 'reports');
  const outPath = path.join(tmpDir, 'claude-mem-ensure.json');
  const reportPath = path.join(reportsDir, 'claude-mem-startup.md');
  const startedAt = new Date().toISOString();
  const runtimePreference = getRuntimePreference(process.argv.slice(2), process.env);

  const summary = {
    repoRoot,
    claudeMemRoot,
    bunBin,
    startedAt,
    runtime: runtimePreference.runtime,
    runtimeReason: runtimePreference.reason,
    installed: fs.existsSync(claudeMemRoot),
    alreadyRunning: false,
    startedDetached: false,
    detachedPid: null,
    ok: false,
    status: 'missing',
    note: '',
    statusCheck: null,
    launch: null,
  };

  if (!summary.installed) {
    summary.note = 'claude-mem checkout missing from repo root';
    writeJson(outPath, summary);
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(reportPath, [
      '# Claude-Mem Startup',
      '',
      `Generated: ${startedAt}`,
      '',
      '- status: missing',
      '- note: claude-mem checkout missing from repo root',
    ].join('\n'));
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  }

  const initialStatus = runStatus(bunBin, claudeMemRoot, summary.runtime);
  summary.statusCheck = initialStatus;

  if (initialStatus.running) {
    summary.alreadyRunning = true;
    summary.ok = true;
    summary.status = 'running';
    summary.note = 'worker already running';
  } else {
    const launch = launchDetached(bunBin, claudeMemRoot, summary.runtime);
    summary.launch = launch;
    summary.startedDetached = Boolean(launch.ok);
    summary.detachedPid = launch.pid;

    let seenRunning = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const status = runStatus(bunBin, claudeMemRoot, summary.runtime);
      if (status.running) {
        summary.ok = true;
        summary.status = 'running';
        summary.note = summary.runtime === 'server-beta' ? 'server-beta started detached' : 'worker started detached';
        summary.alreadyRunning = false;
        summary.statusCheck = status;
        seenRunning = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!seenRunning) {
      summary.ok = Boolean(launch.ok);
      summary.status = launch.ok ? 'starting' : 'failed';
      summary.note = launch.ok
        ? `${summary.runtime} launched detached; status did not confirm within timeout`
        : `${summary.runtime} launch failed`;
    }
  }

  writeJson(outPath, summary);
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(reportPath, [
    '# Claude-Mem Startup',
    '',
    `Generated: ${startedAt}`,
    `Repo: ${repoRoot}`,
    `Runtime: ${summary.runtime}`,
    `Runtime reason: ${summary.runtimeReason}`,
    '',
    '## Status',
    `- ${summary.status}`,
    `- ${summary.note || 'none'}`,
    '',
    '## Detach',
    `- alreadyRunning: ${summary.alreadyRunning}`,
    `- startedDetached: ${summary.startedDetached}`,
    `- detachedPid: ${summary.detachedPid ?? 'n/a'}`,
    '',
    '## Status Check',
    `- running: ${Boolean(summary.statusCheck?.running)}`,
    `- exit: ${summary.statusCheck?.status ?? 'n/a'}`,
    '',
    '## Launch',
    summary.launch
      ? `- ok: ${summary.launch.ok}\n- exit: ${summary.launch.status}\n- pid: ${summary.launch.pid ?? 'n/a'}`
      : '- none',
  ].join('\n'));

  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}

main().catch((error) => {
  const repoRoot = findRepoRoot(process.cwd());
  const outPath = path.join(repoRoot, '.tmp', 'claude-mem-ensure.json');
  const reportPath = path.join(repoRoot, 'reports', 'claude-mem-startup.md');
  const summary = {
    ok: false,
    status: 'error',
    note: error?.message ?? String(error),
    startedAt: new Date().toISOString(),
  };
  try {
    writeJson(outPath, summary);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, [
      '# Claude-Mem Startup',
      '',
      `Generated: ${summary.startedAt}`,
      '',
      `- error: ${summary.note}`,
    ].join('\n'));
  } catch {}
  console.error('[claude-mem:ensure]', summary.note);
  process.exit(1);
});
