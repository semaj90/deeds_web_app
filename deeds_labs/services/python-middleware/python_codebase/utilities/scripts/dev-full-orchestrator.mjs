#!/usr/bin/env node
// Parallel multicore orchestrator with xstate, RabbitMQ, Loki, GPU + nomic-embed vector smoke,
// auto-restart/backoff and circuit-breaker behavior.
import { $ } from 'zx';
import { spawn } from 'child_process';
import net from 'net';
import os from 'os';
import { setTimeout as sleep } from 'timers/promises';
import fetch from 'node-fetch';
import amqplib from 'amqplib';
import { createWriteStream, writeFileSync } from 'fs';
import { createActor, createMachine, assign } from 'xstate';
import Loki from 'lokijs';
import { Worker } from 'worker_threads';
import path from 'path';

const CONFIG = {
  RABBITMQ_URL: process.env.RABBITMQ_URL ?? 'amqp://localhost',
  LOKI_ENABLED: process.env.LOKI_ENABLED === '1' || false,
  NOMiC_EMBED_ENDPOINT: process.env.NOMiC_EMBED_ENDPOINT ?? 'https://api.nomic.ai/embedding',
  NOMiC_API_KEY: process.env.NOMiC_API_KEY ?? '',
  SKIP_QDRANT: process.env.SKIP_QDRANT === '1',
  OLLAMA_CMD: ['ollama', 'serve'],
  FRONTEND_CMD: ['npm', 'run', 'dev'],
  POSTGRES_CMD: ['pg_ctl', '-D', './data/postgres', 'start'],
  REDIS_CMD: [
    process.platform === 'win32'
      ? path.resolve(process.cwd(), 'redis-windows-latest', 'redis-server.exe')
      : 'redis-server',
    process.platform === 'win32'
      ? path.resolve(process.cwd(), 'redis-windows-latest', 'redis.windows.conf')
      : '--port',
    process.platform === 'win32' ? '' : (process.env.REDIS_PORT || '6379')
  ].filter(Boolean),
  QDRANT_CMD: ['qdrant', '--config', 'config.yaml'],
  MINIO_CMD: ['minio', 'server', './data/minio'],
  VECTOR_COLLECTION: 'test_collection',
  MAX_RESTARTS: 5,
  RESTART_BACKOFF_MS: 2000
};

function logConsole(msg) {
  console.log(`[orchestrator] ${new Date().toISOString()} ${msg}`);
}

const infolog = createWriteStream('./orchestrator-inference.log', { flags: 'a' });
function logInference(data) {
  infolog.write(JSON.stringify({ t: new Date().toISOString(), ...data }) + '\n');
}

// Quick port check utility
function isPortOpen(port, host = '127.0.0.1', timeout = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finalize = (v) => { if (!done) { done = true; resolve(v); try { socket.destroy(); } catch {} } };
    socket.setTimeout(timeout);
    socket.once('connect', () => finalize(true));
    socket.once('timeout', () => finalize(false));
    socket.once('error', () => finalize(false));
    socket.connect(port, host);
  });
}

let rabbit = null;
async function getRabbit() {
  if (rabbit) return rabbit;
  try {
    const conn = await amqplib.connect(CONFIG.RABBITMQ_URL);
    const ch = await conn.createChannel();
    await ch.assertExchange('orchestrator.events', 'topic', { durable: false });
    rabbit = { conn, ch };
    return rabbit;
  } catch (err) {
    logConsole('RabbitMQ connect failed: ' + err.message);
    return null;
  }
}
async function emitEvent(routingKey, payload = {}) {
  const r = await getRabbit();
  if (!r) return;
  try {
    r.ch.publish('orchestrator.events', routingKey, Buffer.from(JSON.stringify(payload)));
  } catch (err) {
    logConsole('Emit failed: ' + err.message);
  }
}

// ---------- LOKIJS PERSISTENCE ----------
const db = new Loki(path.resolve(process.cwd(), 'orchestrator.db'), {
  autosave: true,
  autosaveInterval: 5000
});

function getCollection(name) {
  let col = db.getCollection(name);
  if (!col) {
    col = db.addCollection(name, { indices: ['name', 'ts'] });
  }
  return col;
}

const crashesCol = getCollection('crashes');
const restartsCol = getCollection('restarts');
const healthCol = getCollection('health');

function recordCrash(name, code, sig, restarts) {
  crashesCol.insert({ name, code, sig, restarts, ts: Date.now() });
  db.saveDatabase();
}

function recordRestart(name, restarts) {
  restartsCol.insert({ name, restarts, ts: Date.now() });
  db.saveDatabase();
}

function spawnDetached(cmdArr, name) {
  let [cmd, ...args] = cmdArr;
  const isWin = process.platform === 'win32';
  const needsShell = isWin && (/^(npm|npx|powershell|pwsh)$/i.test(cmd) || !/\.exe$/i.test(cmd));
  const options = {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: needsShell
  };
  if (name === 'frontend') {
    options.cwd = path.resolve(process.cwd(), 'sveltekit-frontend');
  }
  const proc = spawn(cmd, args, options);
  proc.stdout?.on('data', (d) => process.stdout.write(`[${name}] ${d}`));
  proc.stderr?.on('data', (d) => process.stderr.write(`[${name}:ERR] ${d}`));
  return proc;
}

// ---- Windows Postgres service auto-detection ----
let cachedPgWinService = null;
async function detectWindowsPgServiceName() {
  if (process.platform !== 'win32') return null;
  if (process.env.PG_WINDOWS_SERVICE) return process.env.PG_WINDOWS_SERVICE;
  if (cachedPgWinService) return cachedPgWinService;
  return await new Promise((resolve) => {
    try {
      const psCmd = "$ErrorActionPreference='SilentlyContinue'; $s=(Get-Service | Where-Object { $_.Name -match 'postgres' -or $_.DisplayName -match 'PostgreSQL' } | Select-Object -ExpandProperty Name); $s -join ','";
      const ps = spawn('powershell', ['-NoProfile', '-Command', psCmd], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      ps.stdout.on('data', (d) => { out += d.toString(); });
      ps.on('error', () => resolve(null));
      ps.on('close', () => {
        const names = out.trim().split(',').map((s) => s.trim()).filter(Boolean);
        if (!names.length) return resolve(null);
        // Prefer names like postgresql-x64-16 > postgresql-x64-15 > others
        const scored = names
          .map((n) => {
            const m = n.match(/(\d{2})/);
            const ver = m ? parseInt(m[1], 10) : 0;
            const pref = /^postgresql/i.test(n) ? 100 : 0;
            return { n, score: pref + ver };
          })
          .sort((a, b) => b.score - a.score);
        cachedPgWinService = scored[0]?.n || names[0];
        resolve(cachedPgWinService);
      });
    } catch {
      resolve(null);
    }
  });
}

function makeServiceMachine(name, cmdArr) {
  return createMachine({
    id: `svc:${name}`,
    context: ({ input }) => ({ name: input?.name ?? name, cmdArr: input?.cmdArr ?? cmdArr, restarts: 0, proc: null }),
    initial: 'stopped',
    states: {
      stopped: { on: { START: 'starting' } },
      starting: {
        entry: ['spawnProc', 'emitStarting'],
        on: { STARTED: 'running', FAIL: 'backoff' }
      },
      running: {
        entry: ['emitRunning'],
        on: {
          EXIT: [
            { target: 'backoff', cond: (ctx) => ctx.restarts < CONFIG.MAX_RESTARTS },
            { target: 'failed' }
          ],
          STOP: { target: 'stopped', actions: ['stopProc'] }
        }
      },
      backoff: { entry: ['incRestart', 'emitBackoff'], after: { [CONFIG.RESTART_BACKOFF_MS]: 'starting' } },
      failed: { entry: ['emitFailed', 'emitPermanentFailure'] }
    }
  }, {
    actions: {
      spawnProc: assign((ctx) => {
        try {
          const resolvedName = ctx?.name ?? name;
          const resolvedCmdArr = Array.isArray(ctx?.cmdArr) && ctx.cmdArr.length > 0
            ? ctx.cmdArr
            : (serviceDefinitions[resolvedName] ?? cmdArr);
          if (!Array.isArray(resolvedCmdArr)) {
            throw new Error('cmdArr is not iterable');
          }
          const proc = spawnDetached(resolvedCmdArr, resolvedName);
          proc.on('error', (err) => {
            logConsole(`${resolvedName} spawn error: ${err.message}`);
            emitEvent(`service.${resolvedName}.error`, { error: err.message });
            // Windows-specific fallback for Postgres if pg_ctl is missing
            if (resolvedName === 'postgres' && process.platform === 'win32' && (err.code === 'ENOENT' || /pg_ctl/i.test(err.message))) {
              (async () => {
                try {
                  const svcName = (await detectWindowsPgServiceName()) || 'postgresql-x64-15';
                  logConsole(`Attempting Windows service start for Postgres: '${svcName}'`);
                  const fb = spawn('net', ['start', svcName], { stdio: 'ignore', shell: true });
                  fb.on('exit', (code) => {
                    if (code === 0) {
                      logConsole(`postgres service '${svcName}' started via Windows service fallback`);
                      try { serviceInterpreters[resolvedName].send({ type: 'STARTED' }); } catch {}
                    } else {
                      logConsole(`postgres service fallback failed with code ${code}`);
                      try { serviceInterpreters[resolvedName].send({ type: 'FAIL' }); } catch {}
                    }
                  });
                } catch (e) {
                  logConsole(`postgres fallback error: ${e.message}`);
                  try { serviceInterpreters[resolvedName].send({ type: 'FAIL' }); } catch {}
                }
              })();
              return ctx;
            }
            try { serviceInterpreters[resolvedName].send({ type: 'FAIL' }); } catch {}
          });
          proc.on('exit', async (code, sig) => {
            logConsole(`${resolvedName} exit code ${code} sig ${sig}`);
            // If common ports are already in use, assume an external instance is running and mark STARTED
            const portMap = { ollama: 11434, minio: 9000, postgres: 5432 };
            const port = portMap[resolvedName];
            const isListening = port ? await isPortOpen(port) : false;

            // If Postgres failed to start via pg_ctl but port isn't open, try Windows Service fallback
            if (resolvedName === 'postgres' && process.platform === 'win32' && code !== 0 && !isListening) {
              try {
                const svcName = (await detectWindowsPgServiceName()) || 'postgresql-x64-15';
                logConsole(`pg_ctl failed; attempting Windows service start for Postgres: '${svcName}'`);
                const fb = spawn('net', ['start', svcName], { stdio: 'ignore', shell: true });
                fb.on('exit', async (c) => {
                  if (c === 0 || (await isPortOpen(5432))) {
                    logConsole(`Postgres service '${svcName}' running`);
                    try { serviceInterpreters[resolvedName].send({ type: 'STARTED' }); } catch {}
                  } else {
                    try { serviceInterpreters[resolvedName].send({ type: 'EXIT' }); } catch {}
                  }
                });
              } catch (e) {
                logConsole(`postgres service fallback error: ${e.message}`);
                try { serviceInterpreters[resolvedName].send({ type: 'EXIT' }); } catch {}
              }
            } else if (isListening) {
              logConsole(`${resolvedName} port ${port} busy, assuming external instance is running`);
              try { serviceInterpreters[resolvedName].send({ type: 'STARTED' }); } catch {}
            } else {
              try { serviceInterpreters[resolvedName].send({ type: 'EXIT' }); } catch {}
            }
            emitEvent(`service.${resolvedName}.exit`, { code, sig });
            recordCrash(resolvedName, code, sig, ctx.restarts);
          });
          // signal started immediately after spawn
          try { serviceInterpreters[resolvedName].send({ type: 'STARTED' }); } catch {}
          return { ...ctx, name: resolvedName, cmdArr: resolvedCmdArr, proc };
        } catch (err) {
          const resolvedName = ctx?.name ?? name;
          logConsole(`spawnProc error for ${resolvedName}: ${err.message}`);
          emitEvent(`service.${resolvedName}.error`, { error: err.message });
          return ctx;
        }
      }),
      incRestart: assign((ctx) => {
        const next = (ctx.restarts ?? 0) + 1;
        recordRestart(ctx.name, next);
        return { ...ctx, restarts: next };
      }),
      emitStarting: (ctx) => { logConsole(`${ctx.name} starting`); emitEvent(`service.${ctx.name}.starting`, { restarts: ctx.restarts }); },
      emitRunning: (ctx) => { logConsole(`${ctx.name} running`); emitEvent(`service.${ctx.name}.running`); },
      emitBackoff: (ctx) => { logConsole(`${ctx.name} backoff (restart ${ctx.restarts})`); emitEvent(`service.${ctx.name}.backoff`, { restarts: ctx.restarts }); },
      emitFailed: (ctx) => { logConsole(`${ctx.name} failed`); emitEvent(`service.${ctx.name}.failed`, { restarts: ctx.restarts }); },
      emitPermanentFailure: (ctx) => { if ((ctx.restarts ?? 0) >= CONFIG.MAX_RESTARTS) emitEvent(`service.${ctx.name}.permanentFailure`, { restarts: ctx.restarts }); },
      stopProc: (ctx) => {
        try {
          if (ctx.proc && !ctx.proc.killed) {
            if (process.platform === 'win32') {
              // Force terminate tree on Windows
              const pid = ctx.proc.pid;
              spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', shell: false });
            } else {
              ctx.proc.kill('SIGTERM');
            }
          }
        } catch (e) {
          logConsole(`stopProc error for ${ctx.name}: ${e.message}`);
        }
      }
    }
  });
}

const serviceDefinitions = {
  frontend: CONFIG.FRONTEND_CMD,
  ollama: CONFIG.OLLAMA_CMD,
  postgres: CONFIG.POSTGRES_CMD,
  redis: CONFIG.REDIS_CMD,
  qdrant: CONFIG.QDRANT_CMD,
  minio: CONFIG.MINIO_CMD,
  fastembed: [
    process.platform === 'win32'
      ? 'python'
      : 'python',
    path.resolve(process.cwd(), 'gpu-inference-worker', 'fastembed_service.py')
  ]
};

if (CONFIG.SKIP_QDRANT) {
  delete serviceDefinitions.qdrant;
}

const serviceInterpreters = {};
function initServices(names) {
  for (const n of names) {
    const machine = makeServiceMachine(n, serviceDefinitions[n]);
  const actor = createActor(machine, { input: { name: n, cmdArr: serviceDefinitions[n] } });
    actor.subscribe((snapshot) => {
      if (!snapshot) return;
      try {
        logConsole(`svc:${n} -> ${snapshot.value}`);
      } catch {}
    });
    serviceInterpreters[n] = actor;
    actor.start();
  }
}

async function gpuUtilization() {
  try {
    const { stdout } = await $`nvidia-smi --query-gpu=utilization.gpu,power.draw --format=csv,noheader,nounits`;
    const [util, watts] = stdout.trim().split(',').map((s) => s.trim());
    return { gpuUtil: Number(util), watts: Number(watts) };
  } catch (err) {
    return { gpuUtil: null, watts: null };
  }
}

async function nomicEmbedText(text = 'health-check') {
  if (!CONFIG.NOMiC_API_KEY || !CONFIG.NOMiC_EMBED_ENDPOINT) {
    return { status: 'skipped', reason: 'no-api-key-or-endpoint' };
  }
  try {
    const res = await fetch(CONFIG.NOMiC_EMBED_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CONFIG.NOMiC_API_KEY}` },
      body: JSON.stringify({ model: 'embed-english-small', input: text })
    });
    if (!res.ok) {
      const txt = await res.text();
      return { status: 'error', http: res.status, text: txt };
    }
    const json = await res.json();
    logInference({ type: 'embedding', text, meta: { size: JSON.stringify(json).length } });
    emitEvent('embedding.generated', { model: 'embed-english-small', length: json.data?.[0]?.embedding?.length ?? null });
    return { status: 'ok', result: json };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

async function vectorQueryCheck() {
  try {
    const res = await fetch(`http://localhost:6333/collections/${CONFIG.VECTOR_COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector: [0.1, 0.2, 0.3, 0.4], limit: 1 })
    });
    if (!res.ok) return { status: 'error', code: res.status };
    return { status: 'ok' };
  } catch (err) {
    return { status: 'unreachable', error: err.message };
  }
}

async function ensureQdrantCollection(name) {
  try {
    // check
    const check = await fetch(`http://localhost:6333/collections/${name}`);
    if (check.ok) return { status: 'exists' };
    // create a basic 4-dim Euclidean collection for smoke usage
    const create = await fetch(`http://localhost:6333/collections/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: { size: 4, distance: 'Cosine' }
      })
    });
    if (!create.ok) return { status: 'error', code: create.status };
    return { status: 'created' };
  } catch (e) {
    return { status: 'unreachable', error: e.message };
  }
}

async function healthSnapshot(startTs, criticalNames, optionalNames) {
  const uptime = Math.round((Date.now() - startTs) / 1000);
  const cpu = os.cpus();
  const [gpu, emb, vector, fastEmbedHealth] = await Promise.all([
    gpuUtilization(),
    nomicEmbedText('health-check ' + new Date().toISOString()),
    vectorQueryCheck(),
    (async () => {
      try {
        const res = await fetch('http://127.0.0.1:8001/health');
        if (!res.ok) return { status: 'error', code: res.status };
        const j = await res.json();
        return { status: 'ok', cuda: j.cuda_available, models: j.models_loaded };
      } catch (e) { return { status: 'unreachable', error: e.message }; }
    })()
  ]);

  const status = {
    contextId: 'dev-full',
    critical: criticalNames,
    optional: optionalNames,
    status: 'degraded',
    readinessSeconds: uptime,
    power: {
      cpuCount: cpu.length,
      loadPerCore: cpu.map((c) => {
        const total = Object.values(c.times).reduce((a, b) => a + b, 0);
        return ((total - c.times.idle) / total).toFixed(2);
      }),
      gpuUtilization: gpu.gpuUtil,
      watts: gpu.watts
    },
    nomicEmbed: emb,
  qdrantVectorCheck: vector,
  fastEmbed: fastEmbedHealth
  };

  const criticalStates = criticalNames.map((n) => {
    const actor = serviceInterpreters[n];
    const snap = actor?.getSnapshot?.();
    return { name: n, state: snap?.value };
  });
  if (criticalStates.every((s) => s.state === 'running')) {
    status.status = 'ready';
  } else {
    status.status = 'starting';
    status.details = { criticalStates };
  }

  // persist health snapshot (thin)
  try {
    healthCol.insert({ ts: Date.now(), status: status.status, readinessSeconds: status.readinessSeconds });
    db.saveDatabase();
    // Also emit a JSON file for tasks to consume
    writeFileSync('./.vscode/orchestrator-health.json', JSON.stringify(status, null, 2));
  } catch {}
  emitEvent('health.snapshot', status);
  return status;
}

// ---------- RABBITMQ CONTROL CHANNEL ----------
async function initControlChannel() {
  try {
    const r = await getRabbit();
    if (!r) { logConsole('Control channel unavailable (RabbitMQ not connected)'); return; }
    const ch = await r.conn.createChannel();
    await ch.assertExchange('orchestrator.control', 'topic', { durable: false });
    const qName = 'orchestrator.control.cmd';
    await ch.assertQueue(qName, { durable: false });
    await ch.bindQueue(qName, 'orchestrator.control', '#');
    await ch.consume(qName, (msg) => {
      if (!msg) return;
      try {
        const payload = JSON.parse(msg.content.toString());
        const { cmd, target } = payload || {};
        logConsole(`Control: ${cmd} -> ${target}`);
        const names = target === 'all' ? Object.keys(serviceInterpreters) : [target];
        for (const n of names) {
          const svc = serviceInterpreters[n];
          if (!svc) continue;
          switch ((cmd || '').toLowerCase()) {
            case 'restart':
              svc.send({ type: 'STOP' });
              setTimeout(() => svc.send({ type: 'START' }), 500);
              break;
            case 'stop':
              svc.send({ type: 'STOP' });
              break;
            case 'start':
              svc.send({ type: 'START' });
              break;
          }
        }
        emitEvent('orchestrator.control.ack', { ok: true, cmd, target });
      } catch (e) {
        emitEvent('orchestrator.control.error', { error: e.message });
      } finally {
        ch.ack(msg);
      }
    });
    logConsole('Control channel ready (queue orchestrator.control.cmd)');
  } catch (e) {
    logConsole('initControlChannel error: ' + e.message);
  }
}

async function main() {
  const startTs = Date.now();
  logConsole('Orchestrator booting');
  initServices(Object.keys(serviceDefinitions));
  // start control channel listener (non-blocking)
  initControlChannel();

  // best-effort: create smoke collection in Qdrant to avoid 404s
  if (!CONFIG.SKIP_QDRANT) {
    ensureQdrantCollection(CONFIG.VECTOR_COLLECTION).then((r) => logConsole(`Qdrant ensure ${CONFIG.VECTOR_COLLECTION}: ${JSON.stringify(r)}`));
  } else {
    logConsole('Qdrant skipped by SKIP_QDRANT=1');
  }

  ['frontend', 'ollama', 'postgres'].forEach((n) => serviceInterpreters[n].send({ type: 'START' }));

  setTimeout(() => {
  const optional = ['redis', 'qdrant', 'minio', 'fastembed'].filter((n) => !!serviceInterpreters[n]);
    optional.forEach((n) => serviceInterpreters[n].send({ type: 'START' }));
  }, 1000);

  const interval = 5000; let tick = 0;
  while (true) {
    tick++;
  const optional = ['redis', 'qdrant', 'minio', 'fastembed'].filter((n) => !!serviceInterpreters[n]);
  const snap = await healthSnapshot(startTs, ['frontend', 'ollama', 'postgres'], optional);
    logConsole(`Health: ${JSON.stringify({ status: snap.status, readinessSeconds: snap.readinessSeconds })}`);
    if (snap.status === 'ready') {
      console.log('FULL_STATUS_JSON_BEGIN');
      console.log(JSON.stringify(snap, null, 2));
      console.log('FULL_STATUS_JSON_END');
      logConsole('Platform Ready');
      break;
    }
    await sleep(interval);
    if (tick > 60) {
      logConsole('Timeout waiting for ready; will continue monitoring.');
      emitEvent('orchestrator.timeout', { ticks: tick });
      break;
    }
  }

  setInterval(async () => {
    const gpu = await gpuUtilization();
    emitEvent('metrics.system', { gpu, cpuLoad: os.loadavg(), time: Date.now() });
  }, 15000);
}

main().catch((err) => {
  logConsole('FATAL: ' + err.message);
  emitEvent('orchestrator.fatal', { error: err.message });
  process.exit(1);
});
