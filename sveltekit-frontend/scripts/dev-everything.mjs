#!/usr/bin/env node
/**
 * dev-everything.mjs
 *
 * Sequenced full-stack startup with health gate.
 *
 * Phase 1 — Background services (all detached, non-blocking):
 *   • docker-compose up -d (full + seaweedfs profiles)
 *   • TurboQuant llama-server.exe  (:8090)
 *   • ACE incremental startup
 *   • Go gRPC retrieval service    (:50053 / :8100)
 *   • TRACE MCP server             (:8788)
 *   • KB retrieval server          (:8789)
 *
 * Phase 2 — Health gate (polls until ready or timeout):
 *   Critical  [fail = abort]:  Redis, Postgres, Qdrant, TRACE MCP
 *   Optional  [fail = warn]:   Ollama, TurboQuant, Bifrost, Go Retrieval
 *
 * Phase 3 — Foreground Vite dev server (:5173, inherits all env vars)
 *
 * Usage:
 *   node scripts/dev-everything.mjs          # same as npm run dev:everything
 *   node scripts/dev-everything.mjs --gpu    # docker gpu profile
 *   node scripts/dev-everything.mjs --dry    # print plan, don't start anything
 */

import { spawn, spawnSync, execSync } from 'node:child_process';
import { existsSync }                 from 'node:fs';
import path                           from 'node:path';
import { fileURLToPath }              from 'node:url';
import { createConnection }           from 'node:net';

const scriptDir   = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const rootDir     = path.resolve(projectRoot, '..');

const GPU = process.argv.includes('--gpu');
const DRY = process.argv.includes('--dry');

// ── ANSI colour helpers ────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  green:   '\x1b[32m',
  red:     '\x1b[31m',
  yellow:  '\x1b[33m',
  cyan:    '\x1b[36m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m',
  white:   '\x1b[37m',
  dim:     '\x1b[2m',
};

const ok  = (msg) => console.log(`${C.green}✅${C.reset} ${msg}`);
const err = (msg) => console.log(`${C.red}❌${C.reset} ${msg}`);
const warn = (msg) => console.log(`${C.yellow}⚠️ ${C.reset} ${msg}`);
const info = (msg) => console.log(`${C.cyan}ℹ️ ${C.reset} ${msg}`);
const hdr  = (msg) => console.log(`\n${C.bold}${C.blue}── ${msg} ──${C.reset}`);

// ── Dev env vars (same as the inline cross-env block in dev:everything) ────
const DEV_ENV = {
  ...process.env,
  DEV_BYPASS_AUTH:         'true',
  NODE_OPTIONS:            '--max-old-space-size=8192',
  ENABLE_GPU:              'true',
  VITE_ENABLE_GPU:         'true',
  PUBLIC_ENABLE_GPU:       'true',
  RTX_3060_OPTIMIZATION:   'true',
  OLLAMA_GPU_LAYERS:       '30',
  SIMD_JSON_PARSER:        'true',
  REDIS_COMPRESS:          'true',
  REDIS_URL:               'redis://127.0.0.1:6379',
  REDIS_PASSWORD:          'redis',
  DATABASE_URL:            'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  OLLAMA_BASE_URL:         'http://127.0.0.1:11434',
  OLLAMA_EMBED_MODEL:      'embeddinggemma:latest',
  OLLAMA_CHAT_KEEP_ALIVE:  '10m',
  OLLAMA_EMBED_KEEP_ALIVE: '24h',
  RETRIEVAL_GRPC_ENABLED:  'true',
  RETRIEVAL_GRPC_URL:      '127.0.0.1:50053',
  SEAWEED_S3_PORT:         '8333',
  SEAWEED_ENDPOINT:        'localhost',
  SEAWEED_ACCESS_KEY:      'minio',
  SEAWEED_SECRET_KEY:      'minio123',
  BODY_SIZE_LIMIT:         '52428800',
  ACE_CHAT_SELF_EVAL_ENABLED: 'false',
  ...(GPU ? { TENSORRT_LLM_ENABLED: 'true' } : {}),
};

// ── Health check helpers ───────────────────────────────────────────────────

async function httpOk(url, timeoutMs = 2000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

async function tcpOk(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port, timeout: timeoutMs });
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error',   () => { sock.destroy(); resolve(false); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
  });
}

function redisOk() {
  try {
    const r = spawnSync('redis-cli', ['-a', 'redis', 'PING'], { encoding: 'utf8', timeout: 2000 });
    return r.stdout.trim() === 'PONG';
  } catch {
    // redis-cli not in PATH — fall back to TCP probe
    return false;
  }
}

async function postgresOk() {
  // Postgres listens on 5434 (mapped from container)
  return tcpOk('127.0.0.1', 5434);
}

// ── Poll until healthy or timeout ──────────────────────────────────────────

async function waitFor(label, checkFn, { timeoutMs = 60_000, intervalMs = 1500, critical = true } = {}) {
  const start = Date.now();
  process.stdout.write(`  ${C.dim}Waiting for ${label}...${C.reset}`);
  while (Date.now() - start < timeoutMs) {
    if (await checkFn()) {
      process.stdout.write(`\r${C.green}✅${C.reset} ${label.padEnd(30)} ${C.dim}(${Date.now() - start}ms)${C.reset}\n`);
      return true;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  process.stdout.write('\r');
  if (critical) {
    err(`${label} — timed out after ${timeoutMs / 1000}s  [CRITICAL]`);
  } else {
    warn(`${label} — not ready after ${timeoutMs / 1000}s  (optional, continuing)`);
  }
  return false;
}

// ── Spawn detached background process ─────────────────────────────────────

function spawnDetached(label, cmd, args, opts = {}) {
  if (DRY) {
    info(`[dry] would spawn detached: ${cmd} ${args.join(' ')}`);
    return;
  }
  try {
    const child = spawn(cmd, args, {
      detached:    true,
      stdio:       'ignore',
      windowsHide: true,
      env:         DEV_ENV,
      ...opts,
    });
    child.unref();
    info(`Spawned ${label} (pid ${child.pid})`);
  } catch (e) {
    warn(`Could not spawn ${label}: ${e.message}`);
  }
}

// ── Phase 1: Background services ───────────────────────────────────────────

async function phase1() {
  hdr('Phase 1 — Starting background services');

  // Docker compose (synchronous — fast, just kicks off containers)
  if (!DRY) {
    info('Running docker-compose up -d ...');
    const profile = GPU
      ? ['--profile', 'full', '--profile', 'seaweedfs', '--profile', 'gpu']
      : ['--profile', 'full', '--profile', 'seaweedfs'];
    try {
      spawnSync('docker-compose', ['-f', path.join(rootDir, 'docker-compose.yml'), ...profile, 'up', '-d'], {
        stdio: 'inherit',
        cwd:   rootDir,
        env:   DEV_ENV,
      });
    } catch (e) {
      warn(`docker-compose up failed: ${e.message}`);
    }
  } else {
    info('[dry] docker-compose up -d (full + seaweedfs profiles)');
  }

  // TurboQuant llama-server (uses its own launch script)
  const turboScript = path.join(projectRoot, 'scripts', 'launch-turboquant.ps1');
  if (existsSync(turboScript)) {
    spawnDetached('TurboQuant :8090', 'pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', turboScript,
    ]);
  }

  // TRACE MCP server — use ensure script for idempotency
  const ensureMcp = path.join(projectRoot, 'scripts', 'ensure-mcp-server.mjs');
  if (existsSync(ensureMcp)) {
    spawnDetached('TRACE MCP :8788', process.execPath, [ensureMcp, '--spawn']);
  }

  // KB retrieval server
  const ensureKb = path.join(projectRoot, 'scripts', 'ensure-kb-retrieval-server.mjs');
  if (existsSync(ensureKb)) {
    spawnDetached('KB Retrieval :8789', process.execPath, [ensureKb, '--spawn']);
  }

  // ACE incremental startup (detached, heavyweight — let it run in background)
  const aceScript = path.join(projectRoot, 'scripts', 'startup', 'ace-incremental-startup.mjs');
  if (existsSync(aceScript)) {
    spawnDetached('ACE startup', process.execPath, [aceScript], { cwd: projectRoot });
  }

  // Go gRPC retrieval service
  const goServiceDir = path.join(projectRoot, '..', 'services', 'go-retrieval-service');
  if (existsSync(path.join(goServiceDir, 'main.go'))) {
    spawnDetached('Go Retrieval :8100', 'go', ['run', '.'], { cwd: goServiceDir });
  }

  // Topology Search Engine — use ensure script for idempotency
  const ensureTopology = path.join(projectRoot, 'scripts', 'ensure-search-engine.mjs');
  if (existsSync(ensureTopology)) {
    spawnDetached('Topology Search :8101', process.execPath, [ensureTopology, '--spawn']);
  }
}

// ── Phase 2: Health gate ───────────────────────────────────────────────────

async function phase2() {
  hdr('Phase 2 — Health gate');

  const critical = await Promise.all([
    waitFor('Redis           :6379', () => Promise.resolve(redisOk()).catch(() => tcpOk('127.0.0.1', 6379)),
            { timeoutMs: 45_000, critical: true }),
    waitFor('Postgres        :5434', postgresOk,
            { timeoutMs: 45_000, critical: true }),
    waitFor('Qdrant          :6333', () => httpOk('http://127.0.0.1:6333/'),
            { timeoutMs: 60_000, critical: true }),
    waitFor('TRACE MCP       :8788', () => httpOk('http://127.0.0.1:8788/health'),
            { timeoutMs: 60_000, critical: true }),
  ]);

  const criticalFailed = critical.some((r) => !r);
  if (criticalFailed) {
    err('One or more critical services failed the health gate. Aborting.');
    err('Fix the failing service(s) above and re-run npm run dev:everything.');
    process.exit(1);
  }

  // Optional — warn but continue
  await Promise.allSettled([
    waitFor('Ollama          :11434', () => httpOk('http://127.0.0.1:11434/api/tags'),
            { timeoutMs: 30_000, critical: false }),
    waitFor('TurboQuant      :8090',  () => httpOk('http://127.0.0.1:8090/health'),
            { timeoutMs: 30_000, critical: false }),
    waitFor('Bifrost         :3040',  () => httpOk('http://127.0.0.1:3040/health'),
            { timeoutMs: 20_000, critical: false }),
    waitFor('Go Retrieval    :8100',  () => httpOk('http://127.0.0.1:8100/health'),
            { timeoutMs: 20_000, critical: false }),
    waitFor('Topology Search  :8101',  () => httpOk('http://127.0.0.1:8101/health'),
            { timeoutMs: 20_000, critical: false }),
    waitFor('KB Retrieval    :8789',  () => httpOk('http://127.0.0.1:8789/health'),
            { timeoutMs: 20_000, critical: false }),
  ]);

  ok('Health gate passed — all critical services ready');
}

// ── Phase 3: Vite dev (foreground) ────────────────────────────────────────

function phase3() {
  hdr('Phase 3 — Starting Vite dev server (:5173)');

  if (DRY) {
    info('[dry] would spawn: vite dev --host 0.0.0.0 --port 5173 (foreground)');
    return;
  }

  // Use npm exec to pick up the project's own vite binary
  const vite = spawn(
    'npx',
    ['vite', 'dev', '--host', '0.0.0.0', '--port', '5173'],
    {
      stdio: 'inherit',
      cwd:   projectRoot,
      env:   DEV_ENV,
      shell: process.platform === 'win32',
    },
  );

  vite.on('exit', (code) => {
    console.log(`\n${C.dim}Vite exited with code ${code}${C.reset}`);
    process.exit(code ?? 0);
  });

  process.on('SIGINT',  () => vite.kill('SIGINT'));
  process.on('SIGTERM', () => vite.kill('SIGTERM'));
}

// ── Entry point ────────────────────────────────────────────────────────────

console.log(`${C.bold}${C.magenta}
╔═══════════════════════════════════════════╗
║   Legal AI Platform — Full Stack Startup  ║
║   Health-gated  •  ${GPU ? 'GPU profile          ' : 'Full profile        '}  ║
╚═══════════════════════════════════════════╝${C.reset}`);

await phase1();
await phase2();
phase3();
