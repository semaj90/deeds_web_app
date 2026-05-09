#!/usr/bin/env node
/**
 * full-system.mjs — single-command system validator (27-gate audit)
 *
 * Replaces the ad-hoc "what should I run after npm run dev?" guesswork
 * with a deterministic tiered ladder. Every check is a numbered gate
 * with explicit tier, side-effect class, and fail policy. Each run
 * writes a timestamped log under logs/test-run/<timestamp>.md.
 *
 * Usage:
 *   node scripts/validate/full-system.mjs              # full ladder (all 23 gates)
 *   node scripts/validate/full-system.mjs --offline    # skip Tier 2 HTTP
 *   node scripts/validate/full-system.mjs --fast       # Tier 0 only (~2s)
 *   node scripts/validate/full-system.mjs --json       # JSON summary on stdout
 *   node scripts/validate/full-system.mjs --gate=G06   # run a single gate
 *
 * Exit codes:
 *   0  all required gates green (warnings + skips are non-fatal)
 *   1  one or more required gates failed
 *   2  validator itself crashed
 *
 * Gate registry (23 gates, T0-T3):
 *
 *   Tier 0 — Static / deterministic (offline)
 *     G01  hash:demo-scene-py            byte-exact match against FROZEN
 *     G02  hash:aesthetic-presets-json   byte-exact match
 *     G03  schema:demo-crime-scene       JSON parses + has required keys
 *     G04  schema:demo-scene-intent      JSON parses + has required keys
 *     G05  determinism:compile-twice     2 consecutive compiles → same hash
 *     G06  python:demo-scene-py          generated .py parses with python -m ast
 *     G07  metadata:demo-scene           plan_hash + generator + events present
 *     G08  smoke:hypergraph-vault        npm script, 8/8 probes pass
 *     G09  smoke:fast-ast                npm script, all pass
 *     G10  fs:required-dirs              memory/reconstruction, scripts/{reconstruction,validate}, src/lib/server/reconstruction
 *
 *   Tier 1 — Environment / workspace
 *     G11  env:node-version              process.versions.node >= 18
 *     G12  env:dev-deps                  node_modules/{cross-env,vite,tsx} present
 *     G13  env:svelte-kit-types          .svelte-kit/types exists (svelte-kit sync ran)
 *     G14  fs:reference-docs             NEXT-SESSION-TODO.md + CLAUDE.md present
 *     G15  net:dev-server-detect         distinguishes SvelteKit vs zombie vs nothing
 *
 *   Tier 2 — Live HTTP (gated on G15 = SvelteKit alive)
 *     G16  http:api-health               GET /api/health → 200 JSON
 *     G17  http:api-ping                 GET /api/ping → 200
 *     G18  http:api-health-redis         GET /api/health/redis → JSON (any status)
 *     G19  http:api-health-database      GET /api/health/database → JSON
 *     G20  http:api-health-ollama        GET /api/health/ollama → JSON
 *
 *   Tier 3 — Audit (warn-only)
 *     G21  audit:tsgo                    error count <= baseline (3 known)
 *     G22  audit:svelte-kit-sync         heuristic: $types presence for known routes
 *     G23  git:uncommitted-critical      warn if scene-compiler.ts or NEXT-SESSION-TODO.md uncommitted
 *
 *   Tier 2 (extended) — Browser + LLM probes
 *     G24  playwright:deep-render        real Chromium, hydration check, console errors
 *     G25  gemma4:agent-roundtrip        POST /api/ai/agent — tool-call wiring proof
 *     G26  turboquant:health             :8090/health — generation backend up
 *     G27  turboquant:chat-roundtrip     :8090/v1/chat/completions — model actually generates
 *
 * Design rules (load-bearing, do not break):
 *   - No service writes. This script is read-only.
 *   - Each gate is a pure async function returning {status, detail, evidence?}.
 *   - SvelteKit-on-5173 detection differentiates "real server" from
 *     "zombie node.exe holding the port" via signature endpoints.
 *   - Hash gates are byte-exact. Drift is always fail, never warn.
 *   - Pre-existing tsgo errors are warnings, never failures (tracked in
 *     NEXT-SESSION-TODO.md for separate cleanup).
 *   - Every gate is independently runnable via --gate=GNN.
 */
import { spawn }            from 'node:child_process';
import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { createHash }        from 'node:crypto';
import { resolve, dirname }  from 'node:path';
import { fileURLToPath }     from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..', '..');

const args     = new Set(process.argv.slice(2));
const OFFLINE  = args.has('--offline');
const FAST     = args.has('--fast');
const JSON_OUT = args.has('--json');
const GATE_FILTER = [...args].find(a => a.startsWith('--gate='))?.slice(7) ?? null;

// ── frozen reference hashes ──────────────────────────────────

const FROZEN = {
  'demo-scene.py': {
    path: 'memory/reconstruction/demo-scene.py',
    sha:  '2c901fdc0a1ab6b9f7377e99f44e776881c7290aa48878de18022f86401037d2',
    rebuild: 'npm run reconstruction:compile-demo',
  },
  'aesthetic-presets.json': {
    path: 'memory/reconstruction/aesthetic-presets.json',
    sha:  '60f537ec35dc98a492a6cec4f9dfef04b90454202beea40a5aa1d6b1f3e5ffdb',
    rebuild: 'npm run reconstruction:emit-presets',
  },
};

// Baseline tsgo error count — exceeding this triggers warn (not fail)
const TSGO_BASELINE = 3;

const DEV_PORT = 5173;
const DEV_BASE = `http://localhost:${DEV_PORT}`;

// TurboQuant llama-server — canonical generation backend per CLAUDE.md
// dual-lane architecture (Embeddings via Ollama, Generation via TurboQuant).
const TURBO_PORT = 8090;
const TURBO_BASE = `http://127.0.0.1:${TURBO_PORT}`;

// ── small utils ──────────────────────────────────────────────

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const ICON = { pass: '✅', warn: '⚠️ ', fail: '❌', skip: '⏸️ ', info: 'ℹ️ ' };

function log(level, msg) {
  if (JSON_OUT) return;
  const tag = { pass: C.green, warn: C.yellow, fail: C.red, skip: C.dim, info: C.cyan }[level] || '';
  console.log(`${tag}${ICON[level]}${C.reset} ${msg}`);
}

async function shaOf(path) {
  const buf = await readFile(resolve(ROOT, path));
  return createHash('sha256').update(buf).digest('hex');
}

async function exists(path) {
  try { await stat(resolve(ROOT, path)); return true; } catch { return false; }
}

async function readJson(path) {
  const txt = await readFile(resolve(ROOT, path), 'utf8');
  return JSON.parse(txt);
}

function runCmd(cmd, args, { timeoutMs = 60_000, cwd = ROOT } = {}) {
  return new Promise((resolveP) => {
    const onWin = process.platform === 'win32';
    const isCmd = onWin && (cmd === 'npm' || cmd === 'npx' || cmd.endsWith('.cmd'));
    const child = spawn(isCmd ? `${cmd}.cmd` : cmd, args, {
      cwd, shell: onWin, env: process.env, windowsHide: true,
    });
    let stdout = '', stderr = '';
    let timedOut = false;
    const t = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch {}
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 1500);
    }, timeoutMs);
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', code => {
      clearTimeout(t);
      resolveP({ code: timedOut ? -1 : (code ?? -1), stdout, stderr, timedOut });
    });
    child.on('error', err => {
      clearTimeout(t);
      resolveP({ code: -2, stdout, stderr: stderr + '\n' + err.message, timedOut: false });
    });
  });
}

const runNpm = (script, opts) => runCmd('npm', ['run', script], opts);

async function fetchSafe(url, { timeoutMs = 5000 } = {}) {
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

function pass(detail, evidence) { return { status: 'pass', detail, evidence }; }
function warn(detail, evidence) { return { status: 'warn', detail, evidence }; }
function fail(detail, evidence) { return { status: 'fail', detail, evidence }; }
function skip(detail) { return { status: 'skip', detail }; }

// ── gates: Tier 0 — static / deterministic ───────────────────

async function G01() {
  const ref = FROZEN['demo-scene.py'];
  if (!(await exists(ref.path))) return fail(`missing ${ref.path} — run \`${ref.rebuild}\``);
  const sha = await shaOf(ref.path);
  return sha === ref.sha
    ? pass(`sha256 ${sha.slice(0, 12)}…`)
    : fail(`DRIFT — expected ${ref.sha.slice(0, 12)}…, got ${sha.slice(0, 12)}…`);
}

async function G02() {
  const ref = FROZEN['aesthetic-presets.json'];
  if (!(await exists(ref.path))) return fail(`missing ${ref.path} — run \`${ref.rebuild}\``);
  const sha = await shaOf(ref.path);
  return sha === ref.sha
    ? pass(`sha256 ${sha.slice(0, 12)}…`)
    : fail(`DRIFT — expected ${ref.sha.slice(0, 12)}…, got ${sha.slice(0, 12)}…`);
}

async function G03() {
  const path = 'scripts/reconstruction/demo-crime-scene.json';
  if (!(await exists(path))) return fail(`missing ${path}`);
  try {
    const j = await readJson(path);
    const required = ['scene_id', 'title', 'duration_s', 'aesthetic', 'events', 'disclaimer'];
    const missing = required.filter(k => !(k in j));
    if (missing.length) return fail(`missing keys: ${missing.join(', ')}`);
    return pass(`${j.events.length} events, scene_id=${j.scene_id}`);
  } catch (e) {
    return fail(`JSON parse error: ${e.message}`);
  }
}

async function G04() {
  const path = 'scripts/reconstruction/demo-scene-intent.json';
  if (!(await exists(path))) return fail(`missing ${path}`);
  try {
    const j = await readJson(path);
    const required = ['scene_id', 'events'];
    const missing = required.filter(k => !(k in j));
    if (missing.length) return fail(`missing keys: ${missing.join(', ')}`);
    return pass(`${j.events.length} intent events`);
  } catch (e) {
    return fail(`JSON parse error: ${e.message}`);
  }
}

async function G05() {
  const ref = FROZEN['demo-scene.py'];
  const sha1 = await shaOf(ref.path);
  const r = await runNpm('reconstruction:compile-demo', { timeoutMs: 30_000 });
  if (r.code !== 0) return fail(`compiler exited ${r.code}: ${r.stderr.slice(-150)}`);
  const sha2 = await shaOf(ref.path);
  return sha1 === sha2
    ? pass('byte-identical across reruns')
    : fail(`drift between runs: ${sha1.slice(0, 12)}… → ${sha2.slice(0, 12)}…`);
}

async function G06() {
  // `python -c "..."` triggers shell-quoting hell on Windows. Use
  // `python -m py_compile <path>` instead — single positional arg, no
  // re-parsing by cmd.exe. py_compile reports SyntaxError on stderr.
  const path = 'memory/reconstruction/demo-scene.py';
  if (!(await exists(path))) return fail('demo-scene.py missing');
  const abs = resolve(ROOT, path);
  let r = await runCmd('python', ['-m', 'py_compile', abs], { timeoutMs: 15_000 });
  if (r.code === -2 || /not recognized|not found/i.test(r.stderr)) {
    r = await runCmd('python3', ['-m', 'py_compile', abs], { timeoutMs: 15_000 });
  }
  if (r.code === -2) return skip('python interpreter not on PATH');
  if (r.code === 0) return pass('compiles cleanly');
  // py_compile prints SyntaxError to stderr; surface the last useful line
  const tail = r.stderr.split('\n').filter(l => l.trim()).slice(-3).join(' ').slice(0, 220);
  return fail(`compile error: ${tail || `exit ${r.code}`}`);
}

async function G07() {
  const path = 'memory/reconstruction/demo-scene-metadata.json';
  if (!(await exists(path))) return fail('metadata file missing — run compile-demo first');
  try {
    const j = await readJson(path);
    const required = ['scene_id', 'events', 'actors', 'generator'];
    const missing = required.filter(k => !(k in j));
    if (missing.length) return fail(`missing keys: ${missing.join(', ')}`);
    if (!j.generator?.plan_hash) return fail('generator.plan_hash absent');
    if (!j.generator?.version)   return fail('generator.version absent');
    return pass(`${j.events.length} events · plan_hash ${j.generator.plan_hash.slice(0, 12)}…`);
  } catch (e) {
    return fail(`JSON parse error: ${e.message}`);
  }
}

async function G08() {
  const r = await runNpm('smoke:hypergraph:vault', { timeoutMs: 60_000 });
  if (r.code !== 0) return fail(r.stderr.slice(-200) || `exit ${r.code}`);
  const m = r.stdout.match(/(\d+\/\d+)\s+probes?\s+pass/i);
  return /all green/i.test(r.stdout)
    ? pass(m?.[1] ?? 'green')
    : fail('not all green');
}

async function G09() {
  const r = await runNpm('smoke:fast-ast', { timeoutMs: 90_000 });
  if (r.code !== 0) return warn(`exit ${r.code}`);
  const m = r.stdout.match(/(\d+)\s+passed.*\((\d+)\s+total\)/);
  return pass(m ? `${m[1]}/${m[2]}` : 'green');
}

async function G10() {
  const dirs = [
    'memory/reconstruction',
    'scripts/reconstruction',
    'scripts/validate',
    'src/lib/server/reconstruction',
  ];
  const missing = [];
  for (const d of dirs) if (!(await exists(d))) missing.push(d);
  return missing.length === 0
    ? pass(`${dirs.length}/${dirs.length} dirs present`)
    : fail(`missing: ${missing.join(', ')}`);
}

// ── gates: Tier 1 — environment ──────────────────────────────

async function G11() {
  const v = process.versions.node;
  const major = parseInt(v.split('.')[0], 10);
  return major >= 18
    ? pass(`node ${v}`)
    : fail(`node ${v} < 18`);
}

async function G12() {
  const deps = ['cross-env', 'vite', 'tsx'];
  const missing = [];
  for (const d of deps) {
    if (!(await exists(`node_modules/${d}/package.json`))) missing.push(d);
  }
  return missing.length === 0
    ? pass(`${deps.length}/${deps.length} dev deps present`)
    : fail(`missing dev deps: ${missing.join(', ')} — run \`npm ci\``);
}

async function G13() {
  if (!(await exists('.svelte-kit/types'))) {
    return fail('`.svelte-kit/types` missing — run `npx svelte-kit sync`');
  }
  return pass('.svelte-kit/types present');
}

async function G14() {
  const required = [
    'memory/reconstruction/NEXT-SESSION-TODO.md',
    'CLAUDE.md',
  ];
  const missing = [];
  for (const f of required) if (!(await exists(f))) missing.push(f);
  return missing.length === 0
    ? pass(`${required.length}/${required.length} reference docs present`)
    : warn(`missing: ${missing.join(', ')}`);
}

async function G15() {
  const root   = await fetchSafe(`${DEV_BASE}/`);
  const ping   = await fetchSafe(`${DEV_BASE}/api/ping`);
  const health = await fetchSafe(`${DEV_BASE}/api/health`);

  if (root.status === 0 && ping.status === 0 && health.status === 0) {
    return skip(`port ${DEV_PORT} not bound — start with \`npm run dev\``);
  }
  if (root.status === 404 && ping.status === 404 && health.status === 404) {
    return fail(
      `ZOMBIE on port ${DEV_PORT} — port bound but every endpoint returns 404. Kill the process before starting npm run dev.`,
      { remediation: 'powershell' }
    );
  }
  const isSvelteKit = root.status === 200 && root.body.includes('<html') && (
    health.status === 200 || ping.status === 200
  );
  if (isSvelteKit) {
    return pass(`SvelteKit alive (/ ${root.status}, /api/ping ${ping.status}, /api/health ${health.status})`);
  }
  return warn(`unexpected shape (/ ${root.status}, /api/ping ${ping.status}, /api/health ${health.status})`);
}

// ── gates: Tier 2 — live HTTP ────────────────────────────────

async function G16() {
  const r = await fetchSafe(`${DEV_BASE}/api/health`, { timeoutMs: 8000 });
  if (!r.ok) return fail(`HTTP ${r.status}`);
  let body; try { body = JSON.parse(r.body); } catch { return warn('200 but body not JSON'); }
  const services = body.services ?? body;
  const summary = Object.entries(services)
    .filter(([_, v]) => v && typeof v === 'object' && 'ok' in v)
    .map(([k, v]) => `${k}=${v.ok ? '✓' : '✗'}`)
    .join(' ');
  return pass(summary || 'JSON returned');
}

async function G17() {
  const r = await fetchSafe(`${DEV_BASE}/api/ping`, { timeoutMs: 5000 });
  if (r.status === 200) return pass('200');
  if (r.status === 404) return warn('endpoint not implemented (404)');
  return fail(`HTTP ${r.status}`);
}

async function G18() {
  // The endpoint itself being reachable is a "pass" for this gate; the
  // Redis-up/down signal is reported in the detail string. We use HTTP
  // status as the primary truth signal (handler returns 5xx when Redis
  // is unreachable, 200 when reachable) and fall back to the JSON
  // `connected` flag only when the body shape is well-formed.
  const r = await fetchSafe(`${DEV_BASE}/api/health/redis`, { timeoutMs: 8000 });
  if (r.status === 0) return fail('connection refused');
  if (r.status === 404) return skip('endpoint not implemented');
  let label = '(unknown)';
  try {
    const j = JSON.parse(r.body);
    const connected = j.connected ?? j.ok ?? null;   // tolerate both shapes
    if (r.status >= 500)         label = '(redis down)';
    else if (connected === false) label = '(redis down)';
    else if (connected === true)  label = '(redis ok)';
    else                          label = `(redis ${r.status === 200 ? 'ok' : 'unclear'})`;
  } catch {
    label = r.status >= 500 ? '(redis down, body not JSON)' : '(body not JSON)';
  }
  return pass(`status=${r.status} ${label}`);
}

async function G19() {
  const r = await fetchSafe(`${DEV_BASE}/api/health/database`, { timeoutMs: 8000 });
  if (r.status === 0) return fail('connection refused');
  if (r.status === 404) return skip('endpoint not implemented');
  try {
    const j = JSON.parse(r.body);
    return pass(`status=${r.status}`);
  } catch {
    return warn(`status ${r.status} but body not JSON`);
  }
}

async function G20() {
  const r = await fetchSafe(`${DEV_BASE}/api/health/ollama`, { timeoutMs: 8000 });
  if (r.status === 0) return fail('connection refused');
  if (r.status === 404) return skip('endpoint not implemented');
  try {
    const j = JSON.parse(r.body);
    return pass(`status=${r.status}`);
  } catch {
    return warn(`status ${r.status} but body not JSON`);
  }
}

// ── gates: Tier 3 — audit (warn-only) ────────────────────────

async function G21() {
  const r = await runNpm('audit:tsgo', { timeoutMs: 180_000 });
  const errs = (r.stdout.match(/error TS\d+:/g) || []).length;
  if (errs === 0) return pass('0 errors');
  if (errs <= TSGO_BASELINE) return warn(`${errs} pre-existing errors (baseline=${TSGO_BASELINE})`);
  return warn(`${errs} errors (above baseline ${TSGO_BASELINE} — investigate)`);
}

async function G22() {
  // Heuristic: check $types files exist for several known routes
  const samples = [
    '.svelte-kit/types/src/routes/(app)/admin/memory-inspector/$types.d.ts',
    '.svelte-kit/types/src/routes/(app)/cases/$types.d.ts',
    '.svelte-kit/types/src/routes/api/health/$types.d.ts',
  ];
  const missing = [];
  for (const s of samples) if (!(await exists(s))) missing.push(s.split('/src/routes/')[1]);
  return missing.length === 0
    ? pass(`${samples.length}/${samples.length} sampled $types present`)
    : warn(`run \`npx svelte-kit sync\` — missing ${missing.length} $types`);
}

async function G23() {
  const r = await runCmd('git', ['status', '--porcelain', '--', 'src/lib/server/reconstruction/scene-compiler.ts', 'memory/reconstruction/NEXT-SESSION-TODO.md', 'scripts/validate/full-system.mjs'], { timeoutMs: 10_000, cwd: ROOT });
  if (r.code !== 0) return skip('git unavailable or not a repo');
  const lines = r.stdout.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return pass('clean');
  return warn(`${lines.length} uncommitted critical file(s): ${lines.map(l => l.trim()).join(', ')}`);
}

/**
 * G25 — VLM Gemma4 agentic tool-call round-trip.
 *
 * POSTs a known query to /api/ai/agent (the Gemma4 tool-call surface per
 * CLAUDE.md §"Gemma4 Tool-Calling Agent"). A successful round-trip means:
 *   1. /api/ai/agent route is wired and reachable
 *   2. server has a live Ollama gemma4 model OR a degraded fallback path
 *   3. the in-process tool registry executes (rag_search, case_search, etc.)
 *   4. response shape includes the documented tool-call metadata
 *
 * Skip cleanly if no SvelteKit on :5173. Warn (not fail) on 5xx — the
 * agent can be down without the rest of the app being broken. Fail only
 * on shape violations or 4xx-not-404.
 */
async function G25() {
  const ping = await fetchSafe(`${DEV_BASE}/`, { timeoutMs: 3000 });
  if (ping.status === 0) return skip('no server on :5173');

  const probe = {
    query: 'What is the schema of the cases table? Use the case_search tool.',
    pipeline: 'agent',
    rounds: 1,         // keep cheap — we just want the wiring proof
    dry_run: true,     // honored by handler when supported, else ignored
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  let res, body;
  try {
    res = await fetch(`${DEV_BASE}/api/ai/agent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(probe),
      signal: ctrl.signal,
    });
    body = await res.text();
  } catch (err) {
    return fail(`request failed: ${err.message.slice(0, 150)}`);
  } finally { clearTimeout(t); }

  if (res.status === 404) return fail('/api/ai/agent not implemented');
  if (res.status === 401 || res.status === 403) return warn(`auth gate (HTTP ${res.status}) — expected with DEV_BYPASS_AUTH=true`);
  if (res.status >= 500) return warn(`HTTP ${res.status} — agent endpoint up but errored: ${body.slice(0, 150)}`);
  if (res.status === 429) return warn('rate-limited (token bucket) — endpoint live, throttled');
  if (!res.ok) return fail(`HTTP ${res.status}: ${body.slice(0, 150)}`);

  let parsed;
  try { parsed = JSON.parse(body); } catch {
    return fail(`200 but body not JSON (${body.slice(0, 80)})`);
  }
  // Documented shape per gemma4-agent.ts AgentRunResult:
  //   { query, answer, toolsUsed?, rounds?, durationMs?, cacheTier?, inferenceBackend?, ... }
  // Some routes nest under `result`; handle both.
  const result = parsed.result ?? parsed;
  const toolsUsed = result.toolsUsed ?? result.tools_used ?? null;
  const hasAnswer = typeof result.answer === 'string' || typeof result.text === 'string' || typeof result.content === 'string';
  if (!hasAnswer && !toolsUsed) {
    return warn(`200 but unexpected shape: ${Object.keys(parsed).join(',') || '(empty)'}`);
  }
  const toolsLabel  = Array.isArray(toolsUsed) ? `tools=[${toolsUsed.slice(0, 3).join(',')}${toolsUsed.length > 3 ? '…' : ''}]` : 'tools=?';
  const durLabel    = result.durationMs != null ? ` ${result.durationMs}ms` : '';
  const roundsLabel = result.rounds     != null ? ` rounds=${result.rounds}` : '';
  // path= surfaces which backend served the response so a future regression
  // (e.g. silent fallback to ollama because bifrost cache misconfigured)
  // is visible in the gate output without needing to read langfuse traces.
  const backend     = result.inferenceBackend ?? result.backend ?? 'unknown';
  const cacheTier   = result.cacheTier        ?? null;
  const pathLabel   = ` path=${backend}${cacheTier ? `(${cacheTier})` : ''}`;
  return pass(`agent reached${durLabel}${roundsLabel}${pathLabel} ${toolsLabel}`);
}

/**
 * G24 — Playwright deep render probe.
 *
 * Goes one layer deeper than G16 (curl /api/health). Uses a real Chromium
 * browser to navigate to the SvelteKit app root, waits for hydration, then
 * inspects the DOM + console for errors. Catches:
 *   - SvelteKit boot errors (server returns 200 HTML but client crashes)
 *   - Missing layout (404 page rendered when route should exist)
 *   - Hydration mismatch (SSR-only, no client mount)
 *   - Zombie process (no SvelteKit signature in HTML)
 *
 * Skips cleanly if @playwright/test isn't installed or no server on :5173.
 */
async function G24() {
  // Skip if no server bound at all (faster than waiting for navigation timeout)
  const ping = await fetchSafe(`${DEV_BASE}/`, { timeoutMs: 3000 });
  if (ping.status === 0) return skip('no server on :5173');

  // Dynamic import — Playwright is a dev dep; if missing, skip cleanly.
  let chromium;
  try {
    ({ chromium } = await import('@playwright/test'));
  } catch {
    return skip('@playwright/test not installed (npm i -D @playwright/test)');
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx  = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();

    const consoleErrors = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('console',  (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    const navResp = await page.goto(DEV_BASE + '/', {
      waitUntil: 'domcontentloaded', timeout: 15_000,
    }).catch((err) => ({ _navError: err.message }));

    if (navResp?._navError) {
      return fail(`navigation failed: ${navResp._navError.slice(0, 150)}`);
    }
    const status = navResp?.status() ?? 0;
    const title  = (await page.title().catch(() => '')) || '(empty)';
    // SvelteKit signature: <body data-sveltekit-preload-data="..."> or
    // any element with data-sveltekit-* attribute. Falls back to <html lang>.
    const sig = await page.evaluate(() => {
      const skBody = document.querySelector('[data-sveltekit-preload-data], [data-sveltekit-hydrate]');
      const html   = document.documentElement;
      return {
        sveltekit: !!skBody,
        htmlLang:  html.getAttribute('lang') || null,
        hasH1:     !!document.querySelector('h1'),
        bodyChars: document.body?.innerText?.length ?? 0,
      };
    }).catch(() => null);

    if (status === 404) {
      return fail(`/ returned 404 — likely zombie or wrong server`);
    }
    if (status >= 500) {
      return fail(`/ returned ${status} (server error)`);
    }
    if (!sig) {
      return fail(`page evaluation failed (status ${status})`);
    }
    if (!sig.sveltekit && sig.bodyChars < 50) {
      return fail(`no SvelteKit signature, body=${sig.bodyChars} chars — not a real app`);
    }

    const errCount = consoleErrors.length;
    const detail = `status=${status} title="${title.slice(0, 40)}" sk=${sig.sveltekit ? '✓' : '✗'} h1=${sig.hasH1 ? '✓' : '✗'} body=${sig.bodyChars}c errs=${errCount}`;
    if (errCount > 0) {
      return warn(`${detail} — first error: ${consoleErrors[0].slice(0, 120)}`);
    }
    return pass(detail);
  } catch (err) {
    return fail(`browser threw: ${err.message.slice(0, 200)}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * G26 — TurboQuant llama-server health probe.
 *
 * Per CLAUDE.md §"Inference Cascade", TurboQuant on :8090 is the canonical
 * generation backend (not Ollama). This gate is independent of the SvelteKit
 * dev server — TurboQuant runs as a detached process via
 * `npm run turbo:start:detached` and serves chat regardless of dev state.
 *
 * Skip cleanly if not running (TurboQuant is optional in dev workflows that
 * only embed). Fail only if the port is bound but the health endpoint
 * returns non-2xx — that's a half-broken server, worse than absent.
 */
async function G26() {
  const r = await fetchSafe(`${TURBO_BASE}/health`, { timeoutMs: 5000 });
  if (r.status === 0) return skip(`port ${TURBO_PORT} not bound — start with \`npm run turbo:start:detached\``);
  if (r.status !== 200) return fail(`HTTP ${r.status} — bound but unhealthy`);
  let body; try { body = JSON.parse(r.body); } catch {
    return warn(`200 but body not JSON: ${r.body.slice(0, 80)}`);
  }
  const status = body.status ?? body.state ?? 'unknown';
  return pass(`status=${status}`);
}

/**
 * G27 — TurboQuant chat-completions round-trip.
 *
 * Proves the model actually generates (not just that the health endpoint
 * responds). Sends a tiny deterministic prompt to the OpenAI-compat
 * endpoint, expects a non-empty completion. Catches:
 *   - model loaded but mmproj/tokenizer broken (200 health, error on chat)
 *   - VRAM exhausted (slow start → 503)
 *   - wrong server binary (D=128 turbo on Gemma4 → garbage output)
 *
 * Skip if G26 didn't pass (no point probing chat if /health fails).
 */
async function G27() {
  const health = await fetchSafe(`${TURBO_BASE}/health`, { timeoutMs: 3000 });
  if (health.status !== 200) return skip('TurboQuant /health not 200 (G26 should fail/skip)');

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  let res, body;
  const tStart = Date.now();
  try {
    res = await fetch(`${TURBO_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4',
        messages: [{ role: 'user', content: 'reply with the single word OK' }],
        max_tokens: 8,
        stream: false,
        temperature: 0,
      }),
      signal: ctrl.signal,
    });
    body = await res.text();
  } catch (err) {
    return fail(`chat request failed: ${err.message.slice(0, 150)}`);
  } finally { clearTimeout(t); }

  const dur = Date.now() - tStart;
  if (!res.ok) return fail(`HTTP ${res.status}: ${body.slice(0, 150)}`);

  let parsed;
  try { parsed = JSON.parse(body); } catch {
    return fail(`200 but body not JSON (${body.slice(0, 80)})`);
  }
  const content = parsed?.choices?.[0]?.message?.content ?? '';
  if (!content || typeof content !== 'string') {
    return fail(`200 JSON but no content (keys: ${Object.keys(parsed).join(',')})`);
  }
  const usage = parsed.usage ?? {};
  return pass(`${dur}ms gen=${usage.completion_tokens ?? '?'}t prompt=${usage.prompt_tokens ?? '?'}t reply="${content.slice(0, 40)}"`);
}

/**
 * G33 — static audit of src/mcp/db-inspection-tools.ts for write verbs.
 *
 * The whole point of the db.* MCP tools is that they're read-only. This gate
 * grep-checks the source file for any write SQL keyword in code positions
 * (not in comment/docstring positions) and fails if found. Cheap regression
 * lock against accidentally adding `db.execute_write` or sprinkling INSERT
 * into a "harmless" handler.
 *
 * Tier 0, fatal: true (read-only is load-bearing for the safety story).
 *
 * False-positives we tolerate:
 *   - `INSERT` / `UPDATE` etc. inside string-literal comments or
 *     description fields (we strip /* ... *\/ and // lines before checking).
 *   - The word "scrubbed" / "[scrubbed]" sentinel.
 */
async function G33() {
  const path = 'src/mcp/db-inspection-tools.ts';
  if (!(await exists(path))) return skip(`${path} missing — Phase B incomplete`);
  const src = await readFile(resolve(ROOT, path), 'utf8');

  // Strip block comments and line comments so docstrings can mention "INSERT".
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  const WRITE_VERBS = /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|TRUNCATE|DROP\s+(TABLE|COLUMN|SCHEMA|INDEX)|CREATE\s+(TABLE|INDEX|SCHEMA)|ALTER\s+TABLE|GRANT|REVOKE|COPY\s+\w+\s+FROM)\b/i;
  const m = stripped.match(WRITE_VERBS);
  if (m) {
    const idx = stripped.indexOf(m[0]);
    const lineNum = stripped.slice(0, idx).split('\n').length;
    return fail(`write verb "${m[0]}" found at line ~${lineNum} — db.* tools must be read-only`);
  }

  // Sanity: must register at least 2 tools.
  const toolCount = (src.match(/server\.tool\(/g) ?? []).length;
  if (toolCount < 2) return fail(`only ${toolCount} server.tool() calls — expected ≥2 (db.schema_overview, db.table_inspect)`);

  return pass(`${toolCount} tools, 0 write verbs`);
}

/**
 * G29 — destructive-SQL detector for pending Drizzle migrations.
 *
 * `drizzle-kit migrate` will happily run a DROP TABLE that wipes prod data
 * if it lands in a numbered SQL file. This gate scans every migration in
 * `drizzle/*.sql` whose tag is NOT in `drizzle/meta/_journal.json` (i.e.
 * still pending) and fails on any destructive op.
 *
 * Excludes `drizzle/manual/` and `drizzle/archived/` — those are operator-
 * curated and don't run automatically.
 *
 * Tier 0, fatal: false (warns loudly so CI surfaces it; flip to fatal once
 * the existing 0001 DROP COLUMN is reconciled).
 */
async function G29() {
  const journalPath = 'drizzle/meta/_journal.json';
  if (!(await exists(journalPath))) return skip('drizzle/meta/_journal.json missing');
  const journal = await readJson(journalPath);
  const appliedTags = new Set((journal.entries ?? []).map(e => e.tag));

  let entries;
  try { entries = await readdir(resolve(ROOT, 'drizzle')); }
  catch { return skip('drizzle/ dir missing'); }

  const sqlFiles = entries.filter(f => /^\d{4}_.+\.sql$/.test(f));
  const pending = sqlFiles.filter(f => !appliedTags.has(f.replace(/\.sql$/, '')));
  if (pending.length === 0) return pass(`0 pending migrations (${sqlFiles.length} applied)`);

  const DESTRUCTIVE = /\b(DROP\s+(TABLE|COLUMN|SCHEMA|DATABASE|INDEX)|TRUNCATE|DELETE\s+FROM(?!\s+\w+\s+WHERE))\b/i;
  const findings = [];
  for (const file of pending) {
    const sql = await readFile(resolve(ROOT, 'drizzle', file), 'utf8');
    const lines = sql.split('\n');
    lines.forEach((line, i) => {
      const stripped = line.replace(/--.*$/, '').trim();
      if (DESTRUCTIVE.test(stripped)) {
        findings.push(`${file}:${i + 1} ${stripped.slice(0, 80)}`);
      }
    });
  }
  if (findings.length === 0) return pass(`${pending.length} pending, no destructive ops`);
  return warn(`${findings.length} destructive op(s) in pending: ${findings.slice(0, 3).join(' | ')}${findings.length > 3 ? ` (+${findings.length - 3} more)` : ''}`);
}

/**
 * G30 — gemma4-offload MCP stdio server: spawn + initialize handshake.
 *
 * Boots `scripts/mcp/gemma4-offload-mcp.mjs` as a stdio child, sends
 * the JSON-RPC `initialize` then `tools/list`, expects ≥4 tools back.
 * Catches: missing file, JSON-RPC handler crash, stdin/stdout deadlock.
 *
 * Independent of TurboQuant/Ollama — just exercises the protocol layer.
 */
async function G30() {
  const path = 'scripts/mcp/gemma4-offload-mcp.mjs';
  if (!(await exists(path))) return fail(`${path} missing`);

  return new Promise(resolveP => {
    const child = spawn(process.execPath, [resolve(ROOT, path)], {
      cwd: ROOT, env: process.env, windowsHide: true,
    });
    let stdout = '', stderr = '';
    let done = false;
    const finish = (res) => { if (!done) { done = true; try { child.kill(); } catch {} resolveP(res); } };
    const t = setTimeout(() => finish(fail('handshake timeout (5s)')), 5_000);
    child.stdout.on('data', d => {
      stdout += d.toString();
      const lines = stdout.split('\n').filter(l => l.trim());
      for (const line of lines) {
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 2 && msg.result?.tools) {
          clearTimeout(t);
          const n = msg.result.tools.length;
          finish(n >= 4 ? pass(`${n} tools registered`) : fail(`only ${n} tools (need ≥4)`));
        }
      }
    });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', err => { clearTimeout(t); finish(fail(`spawn failed: ${err.message}`)); });
    child.on('exit', code => {
      if (!done) { clearTimeout(t); finish(fail(`exited ${code} stderr=${stderr.slice(0, 120)}`)); }
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'g30', version: '0' } } }) + '\n');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  });
}

/**
 * G31 — gemma4-offload MCP tool round-trip via gemma4_health.
 *
 * Calls the cheap health probe tool — proves stdin → tool dispatch → backend
 * fetch → stdout response works end-to-end. Skip if G30 didn't pass.
 */
async function G31() {
  const path = 'scripts/mcp/gemma4-offload-mcp.mjs';
  if (!(await exists(path))) return skip('mcp server missing (G30 should fail)');

  return new Promise(resolveP => {
    const child = spawn(process.execPath, [resolve(ROOT, path)], {
      cwd: ROOT, env: process.env, windowsHide: true,
    });
    let stdout = '';
    let done = false;
    const finish = (res) => { if (!done) { done = true; try { child.kill(); } catch {} resolveP(res); } };
    const t = setTimeout(() => finish(fail('tool call timeout (10s)')), 10_000);
    child.stdout.on('data', d => {
      stdout += d.toString();
      for (const line of stdout.split('\n').filter(l => l.trim())) {
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 2 && msg.result?.content) {
          clearTimeout(t);
          const text = msg.result.content[0]?.text ?? '';
          let body; try { body = JSON.parse(text); } catch { return finish(fail(`non-JSON content: ${text.slice(0, 80)}`)); }
          const turbo = body.turboquant ?? '?', ollama = body.ollama ?? '?';
          const liveCount = [turbo, ollama].filter(s => s === 'ok').length;
          if (liveCount === 0) return finish(warn(`both backends down (turbo=${turbo}, ollama=${ollama})`));
          finish(pass(`turbo=${turbo} ollama=${ollama}`));
        }
      }
    });
    child.on('error', err => { clearTimeout(t); finish(fail(`spawn failed: ${err.message}`)); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'g31', version: '0' } } }) + '\n');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'gemma4_health', arguments: {} } }) + '\n');
  });
}

// ── registry ─────────────────────────────────────────────────

const GATES = [
  { id: 'G01', tier: 0, name: 'hash:demo-scene-py',         fn: G01, fatal: true  },
  { id: 'G02', tier: 0, name: 'hash:aesthetic-presets',     fn: G02, fatal: true  },
  { id: 'G03', tier: 0, name: 'schema:demo-crime-scene',    fn: G03, fatal: true  },
  { id: 'G04', tier: 0, name: 'schema:demo-scene-intent',   fn: G04, fatal: true  },
  { id: 'G05', tier: 0, name: 'determinism:compile-twice',  fn: G05, fatal: true  },
  { id: 'G06', tier: 0, name: 'python:demo-scene-py',       fn: G06, fatal: false },
  { id: 'G07', tier: 0, name: 'metadata:demo-scene',        fn: G07, fatal: true  },
  { id: 'G08', tier: 0, name: 'smoke:hypergraph-vault',     fn: G08, fatal: true  },
  { id: 'G09', tier: 0, name: 'smoke:fast-ast',             fn: G09, fatal: false },
  { id: 'G10', tier: 0, name: 'fs:required-dirs',           fn: G10, fatal: true  },

  { id: 'G11', tier: 1, name: 'env:node-version',           fn: G11, fatal: true  },
  { id: 'G12', tier: 1, name: 'env:dev-deps',               fn: G12, fatal: true  },
  { id: 'G13', tier: 1, name: 'env:svelte-kit-types',       fn: G13, fatal: false },
  { id: 'G14', tier: 1, name: 'fs:reference-docs',          fn: G14, fatal: false },
  { id: 'G15', tier: 1, name: 'net:dev-server-detect',      fn: G15, fatal: true  },

  { id: 'G16', tier: 2, name: 'http:api-health',            fn: G16, fatal: true  },
  { id: 'G17', tier: 2, name: 'http:api-ping',              fn: G17, fatal: false },
  { id: 'G18', tier: 2, name: 'http:api-health-redis',      fn: G18, fatal: false },
  { id: 'G19', tier: 2, name: 'http:api-health-database',   fn: G19, fatal: false },
  { id: 'G20', tier: 2, name: 'http:api-health-ollama',     fn: G20, fatal: false },

  { id: 'G21', tier: 3, name: 'audit:tsgo',                 fn: G21, fatal: false },
  { id: 'G22', tier: 3, name: 'audit:svelte-kit-sync',      fn: G22, fatal: false },
  { id: 'G23', tier: 3, name: 'git:uncommitted-critical',   fn: G23, fatal: false },

  // T2 — Playwright deep render (real Chromium browser, hydration-aware)
  { id: 'G24', tier: 2, name: 'playwright:deep-render',     fn: G24, fatal: false },

  // T2 — VLM Gemma4 agentic tool-call round-trip
  { id: 'G25', tier: 2, name: 'gemma4:agent-roundtrip',     fn: G25, fatal: false },

  // T1 — TurboQuant llama-server (canonical generation backend per CLAUDE.md)
  // T1 because TurboQuant is independent of SvelteKit dev server — runs detached.
  { id: 'G26', tier: 1, name: 'turboquant:health',          fn: G26, fatal: false },
  { id: 'G27', tier: 2, name: 'turboquant:chat-roundtrip',  fn: G27, fatal: false },

  // T0 — Drizzle migration safety: scan pending SQL for destructive ops.
  { id: 'G29', tier: 0, name: 'drizzle:destructive-pending', fn: G29, fatal: false },

  // T1 — gemma4-offload MCP server (Claude Code → local Gemma4 routing).
  { id: 'G30', tier: 1, name: 'mcp:gemma4-offload-handshake', fn: G30, fatal: false },
  { id: 'G31', tier: 1, name: 'mcp:gemma4-offload-roundtrip', fn: G31, fatal: false },

  // T0 — db-inspection-tools.ts must contain zero write verbs (Phase B).
  { id: 'G33', tier: 0, name: 'mcp:db-inspection-readonly',  fn: G33, fatal: true  },
];

// ── runner ───────────────────────────────────────────────────

function shouldRunTier(tier, t1Server) {
  // When user requested a single gate, bypass tier-gating — gates self-skip if needed.
  if (GATE_FILTER) return true;
  if (FAST) return tier === 0;
  if (tier === 0) return true;
  if (tier === 1) return true;
  if (tier === 2) return !OFFLINE && t1Server === 'pass';
  if (tier === 3) return !OFFLINE;
  return false;
}

async function runGate(g) {
  const t = Date.now();
  try {
    const res = await g.fn();
    return { ...g, ...res, ms: Date.now() - t };
  } catch (err) {
    return { ...g, status: 'fail', detail: `gate threw: ${err.message}`, ms: Date.now() - t };
  }
}

function summarize(results) {
  const c = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const r of results) c[r.status] = (c[r.status] || 0) + 1;
  return c;
}

function exitCodeFor(results) {
  for (const r of results) {
    if (r.status === 'fail' && r.fatal) return 1;
  }
  return 0;
}

function ts() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function renderMarkdown(results, durMs, modeLabel) {
  const lines = [];
  lines.push(`# Validation run — ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`**Mode**: ${modeLabel}  `);
  lines.push(`**Duration**: ${(durMs / 1000).toFixed(1)}s  `);
  lines.push(`**Validator**: \`scripts/validate/full-system.mjs\` (23-gate audit)`);
  lines.push('');
  const c = summarize(results);
  lines.push(`**Summary**: ${c.pass} pass · ${c.warn} warn · ${c.fail} fail · ${c.skip} skip`);
  lines.push('');
  lines.push('| Gate | Tier | Name | Status | Detail | Time |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of results) {
    const icon = ICON[r.status]?.trim() || '?';
    const detail = (r.detail || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(`| ${r.id} | T${r.tier} | ${r.name} | ${icon} ${r.status}${r.fatal && r.status === 'fail' ? ' (FATAL)' : ''} | ${detail} | ${r.ms ?? 0}ms |`);
  }
  lines.push('');
  const failing = results.filter(r => r.status === 'fail');
  if (failing.length) {
    lines.push('## Failures');
    lines.push('');
    for (const f of failing) {
      lines.push(`- **${f.id} ${f.name}** (T${f.tier}, ${f.fatal ? 'FATAL' : 'non-fatal'}): ${f.detail}`);
      if (f.evidence?.remediation === 'powershell') {
        lines.push('  ```powershell');
        lines.push(`  netstat -ano | findstr :${DEV_PORT}`);
        lines.push(`  Stop-Process -Id <pid> -Force`);
        lines.push(`  npm run dev`);
        lines.push('  ```');
      }
    }
  }
  const warns = results.filter(r => r.status === 'warn');
  if (warns.length) {
    lines.push('');
    lines.push('## Warnings');
    lines.push('');
    for (const w of warns) {
      lines.push(`- **${w.id} ${w.name}** (T${w.tier}): ${w.detail}`);
    }
  }
  return lines.join('\n') + '\n';
}

// ── main ─────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  const modeLabel = FAST ? 'fast (T0 only)' : OFFLINE ? 'offline (no T2)' : GATE_FILTER ? `single-gate ${GATE_FILTER}` : `full (all ${GATES.length} gates)`;

  log('info', `${C.bold}Validation run${C.reset} — ${modeLabel}`);

  // Build the gate list
  let gates = GATES;
  if (GATE_FILTER) gates = GATES.filter(g => g.id === GATE_FILTER);
  if (gates.length === 0) {
    console.error(`No gate matches ${GATE_FILTER}`);
    process.exit(2);
  }

  const results = [];
  let t1ServerStatus = null;

  // Run by tier so we can short-circuit Tier 2 if no SvelteKit
  for (const tier of [0, 1, 2, 3]) {
    if (!shouldRunTier(tier, t1ServerStatus)) {
      // Mark gates from this tier as skip
      for (const g of gates.filter(g => g.tier === tier)) {
        results.push({ ...g, status: 'skip', detail: tier === 2 ? 'Tier 1 dev-server not green' : `tier ${tier} disabled by mode`, ms: 0 });
      }
      continue;
    }
    log('info', `Tier ${tier} ${tier === 0 ? '— pre-flight' : tier === 1 ? '— environment' : tier === 2 ? '— live HTTP' : '— audit (warn-only)'}`);
    for (const g of gates.filter(g => g.tier === tier)) {
      const r = await runGate(g);
      results.push(r);
      log(r.status, `[${r.id} T${r.tier}] ${r.name} — ${r.detail} ${C.dim}(${r.ms}ms)${C.reset}`);
      if (g.id === 'G15') t1ServerStatus = r.status;
    }
  }

  const c = summarize(results);
  const dur = Date.now() - t0;
  if (!JSON_OUT) {
    console.log('');
    console.log(`${C.bold}Summary${C.reset}: ${C.green}${c.pass} pass${C.reset}  ${C.yellow}${c.warn} warn${C.reset}  ${C.red}${c.fail} fail${C.reset}  ${C.dim}${c.skip} skip${C.reset}  (${(dur/1000).toFixed(1)}s)`);
  }

  await mkdir(resolve(ROOT, 'logs/test-run'), { recursive: true });
  const stamp = ts();
  const logPath = resolve(ROOT, `logs/test-run/validate-${stamp}.md`);
  await writeFile(logPath, renderMarkdown(results, dur, modeLabel), 'utf8');
  if (!JSON_OUT) console.log(`${C.dim}log: ${logPath}${C.reset}`);

  if (JSON_OUT) {
    console.log(JSON.stringify({
      mode: modeLabel,
      duration_ms: dur,
      counts: c,
      results: results.map(r => ({
        id: r.id, tier: r.tier, name: r.name, fatal: r.fatal,
        status: r.status, detail: r.detail, ms: r.ms,
      })),
      log_path: logPath,
    }, null, 2));
  }

  process.exit(exitCodeFor(results));
}

main().catch(err => {
  console.error('validator crashed:', err);
  process.exit(2);
});
