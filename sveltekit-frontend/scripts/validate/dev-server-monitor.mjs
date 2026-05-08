#!/usr/bin/env node
/**
 * dev-server-monitor.mjs — visibility wrapper around `npm run dev`
 *
 * Solves the "I ran npm run dev in PowerShell and have no idea what it's
 * doing" problem from the VS Code workspace. Spawns `npm run dev`, tees
 * all stdout/stderr to both:
 *   1. the live console (so PowerShell shows the stream)
 *   2. logs/dev-server/dev-<timestamp>.log (durable, tail-able)
 * Then probes /api/health every 2s. Reports:
 *   - "READY"   when SvelteKit responds with HTML on /
 *   - "ZOMBIE"  when port 5173 is bound but every endpoint 404s
 *   - "FAILED"  when child exits non-zero before READY
 *   - "STALLED" when --timeout-ms elapses without READY
 *
 * Usage:
 *   node scripts/validate/dev-server-monitor.mjs           # foreground, kill with Ctrl-C
 *   node scripts/validate/dev-server-monitor.mjs --quiet   # only status lines, no tee
 *   node scripts/validate/dev-server-monitor.mjs --probe-only --pid=20508
 *                                                          # don't spawn, just probe existing
 *   node scripts/validate/dev-server-monitor.mjs --kill-zombie
 *                                                          # if zombie detected, Stop-Process it (Windows)
 *   node scripts/validate/dev-server-monitor.mjs --port=5174
 *                                                          # use alternate port (sets VITE_PORT env)
 *
 * Exit codes:
 *   0  READY (server up, SvelteKit signature confirmed)
 *   1  ZOMBIE (port held by non-SvelteKit process)
 *   2  FAILED (child exited before READY)
 *   3  STALLED (timeout reached)
 *   4  monitor crashed
 *
 * Reads:  none of the running services
 * Writes: logs/dev-server/dev-<TS>.log (rotating per-run)
 */
import { spawn }            from 'node:child_process';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath }     from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..', '..');

const args      = process.argv.slice(2);
const QUIET     = args.includes('--quiet');
const PROBE_ONLY = args.includes('--probe-only');
const KILL_ZOMBIE = args.includes('--kill-zombie');
const PORT      = (() => {
  const p = args.find(a => a.startsWith('--port='));
  return p ? parseInt(p.slice(7), 10) : 5173;
})();
const TIMEOUT_MS = (() => {
  const t = args.find(a => a.startsWith('--timeout-ms='));
  return t ? parseInt(t.slice(13), 10) : 120_000;
})();
const PROBE_PERIOD_MS = 2000;

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};

function ts() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function status(level, msg) {
  const tag = { READY: C.green, ZOMBIE: C.red, FAILED: C.red, STALLED: C.yellow, INFO: C.cyan, WARN: C.yellow }[level] || '';
  console.log(`${tag}[monitor:${level}]${C.reset} ${msg}`);
}

async function fetchSafe(url, { timeoutMs = 4000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: '', error: err.message };
  } finally {
    clearTimeout(t);
  }
}

/** Returns { state: 'ready'|'zombie'|'down', detail } */
async function probe(port) {
  const base = `http://localhost:${port}`;
  const root = await fetchSafe(`${base}/`);
  const health = await fetchSafe(`${base}/api/health`);
  const ping = await fetchSafe(`${base}/api/ping`);

  if (root.status === 0 && health.status === 0 && ping.status === 0) {
    return { state: 'down', detail: `port ${port} not bound` };
  }
  if (root.status === 404 && health.status === 404 && ping.status === 404) {
    return { state: 'zombie', detail: `port ${port} bound, all endpoints 404` };
  }
  const isSk = root.status === 200 && root.body.includes('<html') && (health.status === 200 || ping.status === 200);
  if (isSk) {
    return { state: 'ready', detail: `SvelteKit (/ ${root.status}, /api/health ${health.status}, /api/ping ${ping.status})` };
  }
  return { state: 'unclear', detail: `/ ${root.status}, /api/health ${health.status}, /api/ping ${ping.status}` };
}

async function findPidOnPort(port) {
  // Windows: netstat -ano | findstr :PORT
  // POSIX:   lsof -ti:PORT
  const onWin = process.platform === 'win32';
  return new Promise((res) => {
    const cmd = onWin ? 'netstat' : 'lsof';
    const a   = onWin ? ['-ano'] : ['-ti', `:${port}`];
    const p = spawn(cmd, a, { shell: onWin, windowsHide: true });
    let out = '';
    p.stdout.on('data', d => { out += d.toString(); });
    p.on('close', () => {
      if (onWin) {
        const re = new RegExp(`:${port}\\s+\\S+\\s+LISTEN\\w*\\s+(\\d+)`);
        const m = out.match(re);
        res(m ? parseInt(m[1], 10) : null);
      } else {
        const pid = parseInt(out.trim().split('\n')[0], 10);
        res(Number.isFinite(pid) ? pid : null);
      }
    });
    p.on('error', () => res(null));
  });
}

async function killPid(pid) {
  const onWin = process.platform === 'win32';
  return new Promise((res) => {
    if (onWin) {
      const p = spawn('taskkill', ['/PID', String(pid), '/F'], { shell: true, windowsHide: true });
      p.on('close', code => res(code === 0));
      p.on('error', () => res(false));
    } else {
      const p = spawn('kill', ['-9', String(pid)]);
      p.on('close', code => res(code === 0));
      p.on('error', () => res(false));
    }
  });
}

async function main() {
  const stamp = ts();
  await mkdir(resolve(ROOT, 'logs/dev-server'), { recursive: true });
  const logPath = resolve(ROOT, `logs/dev-server/dev-${stamp}.log`);
  await writeFile(logPath, `# dev-server-monitor — ${new Date().toISOString()}\n# port=${PORT} timeout_ms=${TIMEOUT_MS}\n\n`);

  status('INFO', `log → ${logPath}`);

  // ── --probe-only ──────────────────────────────────────────
  if (PROBE_ONLY) {
    const r = await probe(PORT);
    status(r.state.toUpperCase(), r.detail);
    if (r.state === 'zombie' && KILL_ZOMBIE) {
      const pid = await findPidOnPort(PORT);
      if (pid) {
        status('WARN', `killing zombie PID ${pid}`);
        const ok = await killPid(pid);
        status(ok ? 'INFO' : 'FAILED', ok ? `killed PID ${pid}` : `failed to kill PID ${pid}`);
      } else {
        status('WARN', 'could not identify PID');
      }
    }
    process.exit(r.state === 'ready' ? 0 : r.state === 'zombie' ? 1 : 3);
  }

  // ── pre-flight: refuse to start if zombie present ────────
  const pre = await probe(PORT);
  if (pre.state === 'zombie') {
    status('ZOMBIE', pre.detail);
    if (KILL_ZOMBIE) {
      const pid = await findPidOnPort(PORT);
      if (pid) {
        status('WARN', `killing zombie PID ${pid} before starting dev`);
        await killPid(pid);
        await new Promise(r => setTimeout(r, 1500));
      }
    } else {
      status('FAILED', 'port already held — pass --kill-zombie or stop the offending process manually');
      process.exit(1);
    }
  } else if (pre.state === 'ready') {
    status('READY', `existing SvelteKit on :${PORT} — nothing to do (use --probe-only to just verify)`);
    process.exit(0);
  }

  // ── spawn npm run dev ────────────────────────────────────
  const onWin = process.platform === 'win32';
  const env = { ...process.env };
  if (PORT !== 5173) env.VITE_PORT = String(PORT); // works for vite >= 5

  status('INFO', `spawning \`npm run dev\` (port=${PORT})`);
  const child = spawn(onWin ? 'npm.cmd' : 'npm', ['run', 'dev'], {
    cwd: ROOT, shell: onWin, env, windowsHide: true,
  });

  let resolved = false;
  let lineBuf  = '';

  const writeLine = async (stream, line) => {
    if (!QUIET) process[stream].write(line);
    await appendFile(logPath, line);
  };
  child.stdout.on('data', async (d) => { await writeLine('stdout', d.toString()); });
  child.stderr.on('data', async (d) => { await writeLine('stderr', d.toString()); });

  child.on('close', async (code) => {
    if (resolved) return;
    resolved = true;
    status('FAILED', `dev process exited code=${code} before READY — check ${logPath}`);
    process.exit(2);
  });
  child.on('error', async (err) => {
    if (resolved) return;
    resolved = true;
    status('FAILED', `spawn failed: ${err.message}`);
    process.exit(2);
  });

  // ── ready loop ────────────────────────────────────────────
  const t0 = Date.now();
  while (!resolved) {
    if (Date.now() - t0 > TIMEOUT_MS) {
      status('STALLED', `no READY within ${TIMEOUT_MS}ms — child still alive but unresponsive`);
      try { child.kill('SIGTERM'); } catch {}
      process.exit(3);
    }
    await new Promise(r => setTimeout(r, PROBE_PERIOD_MS));
    if (resolved) break;
    const r = await probe(PORT);
    if (r.state === 'ready') {
      resolved = true;
      status('READY', `${r.detail} (${((Date.now() - t0)/1000).toFixed(1)}s)`);
      status('INFO', `dev server PID=${child.pid} — Ctrl-C to stop. Tail log: tail -f ${logPath}`);
      // Hand off: forward signals + keep streaming until child dies
      const forward = (sig) => () => { try { child.kill(sig); } catch {} };
      process.on('SIGINT', forward('SIGINT'));
      process.on('SIGTERM', forward('SIGTERM'));
      // Wait for child to exit (don't exit ourselves)
      child.on('close', (code) => process.exit(code ?? 0));
      return;
    }
    if (r.state === 'zombie') {
      // Shouldn't happen if pre-flight cleared, but guard anyway
      status('ZOMBIE', `mid-startup zombie? ${r.detail}`);
    }
  }
}

main().catch((err) => {
  status('FAILED', `monitor crashed: ${err.message}`);
  console.error(err.stack);
  process.exit(4);
});
