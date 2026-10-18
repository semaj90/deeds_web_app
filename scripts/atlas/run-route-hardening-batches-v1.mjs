#!/usr/bin/env node
/**
 * Batched, memory-safe runner for tests/e2e/production-hardening-routes.spec.ts (replaces the session-local run-batches*.sh).
 *
 * Why batches: the Vite dev server grows past ~4.5 GB heap after ~45 heavy routes and dies, turning later routes into
 * ERR_CONNECTION_REFUSED false failures. This runner restarts a heap-capped dev server between small batches.
 *
 *   node scripts/atlas/run-route-hardening-batches-v1.mjs [--routes routes.json] [--batch 10] [--heap 3072]
 *                                                         [--ready-minutes 5] [--dry-run]
 *
 * --routes  JSON array of route paths (default: every route the spec discovers).
 * Safety: it only ever stops a :5173 listener whose command line is vite/svelte-kit (never `dev:gpu`'s servers or anything else),
 *         the spec's mutation fence still blocks non-GET and job-trigger requests, and nothing writes a database.
 * Output: per-route JSON in logs/task-output/route-hardening/, batch log in logs/task-output/route-hardening-batches.log.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const FE = path.join(REPO, 'sveltekit-frontend');
const LOG = path.join(REPO, 'logs', 'task-output', 'route-hardening-batches.log');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const BATCH = Number(arg('batch', 10));
const HEAP = Number(arg('heap', 3072));
const READY_MS = Number(arg('ready-minutes', 5)) * 60_000;
const ROUTES = arg('routes') ? path.resolve(arg('routes')) : null;
const DRY = process.argv.includes('--dry-run');
const PORT = 5173;
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const logLine = (s) => { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, `${new Date().toISOString()} ${s}\n`); console.log(s); };
const ps = (cmd) => execFileSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' }).trim();

function listenerPid() {
	if (process.platform !== 'win32') throw new Error('this runner currently supports Windows only');
	const out = ps(`(Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`);
	return out ? Number(out) : null;
}
function stopServer() {
	const pid = listenerPid();
	if (!pid) return;
	const cmd = ps(`(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`);
	if (!/vite|svelte-kit/i.test(cmd)) throw new Error(`REFUSING to stop PID ${pid} on :${PORT}: not a vite/svelte-kit process (${cmd.slice(0, 80)})`);
	ps(`Stop-Process -Id ${pid} -Force`);
}
async function waitReady() {
	const end = Date.now() + READY_MS;
	while (Date.now() < end) {
		try { const r = await fetch(`http://127.0.0.1:${PORT}/library`, { signal: AbortSignal.timeout(20_000) }); if (r.ok) return true; } catch { /* still compiling */ }
		await new Promise((r) => setTimeout(r, 3000));
	}
	return false;
}
function totalRoutes() {
	if (ROUTES) return JSON.parse(fs.readFileSync(ROUTES, 'utf8')).length;
	const r = spawnSync(npx, ['playwright', 'test', 'tests/e2e/production-hardening-routes.spec.ts', '--project=chromium', '--list'], { cwd: FE, encoding: 'utf8', shell: true, env: { ...process.env, PLAYWRIGHT_SKIP_GLOBAL_SETUP: 'true' } });
	const m = /Total: (\d+) tests/.exec(r.stdout ?? '');
	if (!m) throw new Error('could not count routes: ' + (r.stderr || r.stdout).slice(0, 300));
	return Number(m[1]);
}

const total = totalRoutes();
const batches = Array.from({ length: Math.ceil(total / BATCH) }, (_, i) => [i * BATCH, Math.min(total, (i + 1) * BATCH)]);
logLine(`plan: ${total} routes, batch=${BATCH}, heap=${HEAP}MB, batches=${batches.length}${ROUTES ? `, routes=${ROUTES}` : ''}`);
if (DRY) { console.log(JSON.stringify(batches)); process.exit(0); }

let failed = 0;
for (const [a, b] of batches) {
	stopServer();
	await new Promise((r) => setTimeout(r, 3000));
	const dev = spawn(npx, ['vite', 'dev'], { cwd: FE, shell: true, stdio: 'ignore', detached: true, env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${HEAP}` } });
	dev.unref();
	if (!(await waitReady())) { logLine(`batch ${a}:${b} ABORT: dev server not ready in ${READY_MS / 60000} min`); stopServer(); process.exit(2); }
	const env = { ...process.env, PLAYWRIGHT_SKIP_GLOBAL_SETUP: 'true', HARDEN_SLICE: `${a}:${b}`, ...(ROUTES ? { HARDEN_ROUTES_FILE: ROUTES } : {}) };
	const r = spawnSync(npx, ['playwright', 'test', 'tests/e2e/production-hardening-routes.spec.ts', '--project=chromium', '--workers=1', '--reporter=line'], { cwd: FE, shell: true, stdio: 'inherit', env });
	logLine(`batch ${a}:${b} exit=${r.status}`);
	if (r.status !== 0) failed += 1; // non-zero = some routes failed their hard criteria; records are still written
}
stopServer();
logLine(`done: ${batches.length} batches, ${failed} with failing routes`);
