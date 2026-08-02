#!/usr/bin/env node
/**
 * scripts/atlas/dispatcher-worker-runtime.mts
 * =============================================
 * Manual, explicit entrypoint for the LangGraph dispatcher orchestration
 * chain (rabbitmq-identity-listener.ts -> executeDispatcherOrchestration ->
 * createDispatcherGraph -> dispatcher nodes). Confirmed this session
 * (openspec/changes/parent-atlas-runtime-ownership-precall/proposal.md,
 * "Group A") that startIdentityListener() has real node implementations
 * and genuine MCP client calls, but zero callers anywhere in the app —
 * this is the first one.
 *
 * ALWAYS run via the bootstrap (npm run atlas:dispatcher:worker), never
 * this file directly — env loading happens there, before this file's
 * ENV-dependent dynamic imports run. See dispatcher-worker-bootstrap.mts.
 *
 * Deliberately NOT wired into hooks.server.ts — vite dev reloads the
 * module graph on file changes, and a hook-based start would spawn
 * duplicate RabbitMQ consumers on every reload. Same failure class as
 * this session's TurboVec duplicate-bind bug (two processes holding a
 * listener, work nondeterministically routed between them). This is a
 * standalone process, launched explicitly, not auto-started.
 *
 * Modes:
 *   (none)      Full startup: connect, declare topology, start consuming,
 *               write heartbeat, wait for SIGTERM/SIGINT.
 *   --dry-run   Validate config, import + compile the dispatcher graph,
 *               report queue/exchange names. Opens NO broker connection,
 *               registers NO consumer, publishes nothing. Exit 0/1.
 *   --smoke     Full startup through READY, then a deterministic
 *               self-triggered shutdown (not an OS signal) and exit 0.
 *               Added because this repo's dev environment is Windows,
 *               where Node has no real POSIX signal delivery to a
 *               backgrounded/piped child process — external SIGTERM/
 *               SIGINT delivery could not be proven live here (confirmed:
 *               both `Stop-Process` and Node's own `child.kill('SIGINT')`
 *               hard-terminate rather than deliver a catchable signal on
 *               this platform). --smoke proves the SAME shutdown code
 *               path deterministically, without depending on OS signal
 *               emulation, and remains meaningful in real (Linux/
 *               container) deployments too.
 *
 * Single-instance lock: LOCAL-DEV SAFETY NET ONLY, not a distributed
 * singleton guarantee. RabbitMQ's competing-consumers pattern already
 * makes running N of this worker safe and often desirable for horizontal
 * scaling (prefetch(1) fair-dispatch is already set in
 * rabbitmq-identity-listener.ts). This lock exists only to stop
 * accidentally launching two copies from the SAME checkout during dev —
 * it does nothing across two checkouts, two containers, WSL vs Windows,
 * or two machines. If this worker's contract ever requires an actual
 * single global consumer, that needs a PostgreSQL advisory lock or a
 * broker-level single-active-consumer feature, not a local file.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOCK_FILE = path.join(REPO_ROOT, '.atlas-dispatcher-worker-lock');
const LOCK_TIMEOUT_MS = 20 * 60 * 1000; // 20 min hard ceiling, same as graphify's pipeline lock
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TTL_SECONDS = 45; // 3x the interval — a missed beat or two doesn't false-alarm

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SMOKE = args.includes('--smoke');

function log(msg: string, extra?: Record<string, unknown>) {
  const line = { ts: new Date().toISOString(), worker: 'atlas-dispatcher', msg, ...extra };
  console.log(JSON.stringify(line));
}

function errLog(msg: string, extra?: Record<string, unknown>) {
  const line = { ts: new Date().toISOString(), worker: 'atlas-dispatcher', level: 'error', msg, ...extra };
  console.error(JSON.stringify(line));
}

// ── Single-instance lock (PID-liveness, not just file age) ─────────────────
// Same pattern as scripts/atlas/graphify-trigger-downstream-pipeline.mjs's
// acquireLock/releaseLock, fixed this session (commit 43824e4fcf) after a
// stale lock from a crashed process blocked legitimate runs, and a losing
// racer was found to unconditionally delete the winner's live lock. Both
// bugs are avoided here from the start rather than repeated. Scope
// limitation documented in this file's header comment above.

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

async function acquireLock(): Promise<void> {
  const stat = await fs.stat(LOCK_FILE).catch(() => null);
  if (stat) {
    const age = Date.now() - stat.mtime.getTime();
    let recordedPid: number | null = null;
    try {
      const contents = JSON.parse(await fs.readFile(LOCK_FILE, 'utf8'));
      recordedPid = Number.isInteger(contents.pid) ? contents.pid : null;
    } catch {
      // Unreadable/corrupt lock file — treat as stale below.
    }

    const holderAlive = recordedPid !== null && recordedPid !== process.pid && isPidAlive(recordedPid);
    if (holderAlive && age < LOCK_TIMEOUT_MS) {
      throw new Error(
        `Another dispatcher worker is running (pid ${recordedPid}, lock age: ${Math.floor(age / 1000)}s). ` +
          `Wait for it to exit or delete ${LOCK_FILE}.`
      );
    }
    await fs.unlink(LOCK_FILE).catch(() => {});
  }

  await fs.writeFile(
    LOCK_FILE,
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    'utf8'
  );
  log('lock_acquired', { lockFile: LOCK_FILE, pid: process.pid });
}

async function releaseLock(): Promise<void> {
  await fs.unlink(LOCK_FILE).catch(() => {});
}

// ── Dry run ──────────────────────────────────────────────────────────────
// Gate 1 (operator review): validate env, import graph modules, compile
// the dispatcher graph, report queue configuration — WITHOUT opening a
// broker consumer or publishing anything.

async function dryRun(): Promise<void> {
  log('starting', { mode: 'dry-run' });

  const { ENV } = await import('$lib/server/env.server.js');
  log('config_validated', {
    rabbitmqConfigured: Boolean(ENV.RABBITMQ_URL),
    qdrantBaseUrl: ENV.QDRANT_URL,
  });
  if (!ENV.RABBITMQ_URL) {
    throw new Error('RABBITMQ_URL is not configured.');
  }

  const { createDispatcherGraph } = await import('$lib/server/langgraph/dispatcher-graph.js');
  // Graph construction/compilation does not require live clients — nodes
  // only read ctx fields when actually INVOKED, not when the graph is
  // built. Placeholder values are enough to prove the graph compiles.
  const graph = createDispatcherGraph({
    state: {} as never,
    mcpClient: null,
    postgres: null,
    redis: null,
    qdrant: null,
    neo4j: null,
  });
  if (!graph) {
    throw new Error('createDispatcherGraph() returned a falsy value.');
  }
  log('dispatcher_graph_compiled');

  log('dry_run_complete', {
    queue: 'dispatcher.identity.updated',
    dlq: 'dispatcher.identity.updated.dlq',
    exchange: 'dispatcher.events',
  });
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) {
    try {
      await dryRun();
      process.exitCode = 0;
    } catch (err) {
      errLog('dry_run_failed', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      process.exitCode = 1;
    }
    return;
  }

  // Shared mutable state, declared before any async setup and read by the
  // shutdown handler below — this must tolerate being called at ANY point
  // during startup, not just after everything is fully initialized. First
  // live run of this worker proved why: a signal arriving mid-startup (e.g.
  // while still awaiting the RabbitMQ connection) with handlers registered
  // only at the end of setup meant Node's default signal behavior fired
  // instead, leaking the lock file with zero cleanup. Handlers are now
  // registered immediately after the lock is acquired, and every cleanup
  // step below is individually guarded so partial state never throws.
  let lockHeld = false;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let heartbeatKey: string | null = null;
  let neo4jSession: { close(): Promise<void> } | null = null;
  let listener: { start(): Promise<void>; stop(): Promise<void>; status(): unknown } | null = null;
  let redisClient: { del(key: string): Promise<unknown> } | null = null;
  let closeRabbit: (() => Promise<void>) | null = null;
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('shutdown_started', { signal });

    if (heartbeatTimer) clearInterval(heartbeatTimer);

    try {
      await listener?.stop();
      log('listener_stopped');
    } catch (e) {
      errLog('listener_stop_failed', { error: e instanceof Error ? e.message : String(e) });
    }

    if (redisClient && heartbeatKey) {
      try {
        await redisClient.del(heartbeatKey);
        log('redis_closed');
      } catch {
        // non-fatal
      }
    }

    try {
      await neo4jSession?.close();
    } catch {
      // non-fatal
    }

    try {
      await closeRabbit?.();
    } catch (e) {
      errLog('rabbitmq_close_failed', { error: e instanceof Error ? e.message : String(e) });
    }

    if (lockHeld) {
      await releaseLock();
      log('lock_released');
    }
    log('shutdown_complete');
    process.exit(0);
  };

  try {
    log('starting', { mode: SMOKE ? 'smoke' : 'normal' });
    await acquireLock();
    lockHeld = true;

    // Registered here, immediately after the lock is held — not after the
    // rest of setup completes — so a signal during RabbitMQ/Postgres/Neo4j
    // connection setup still releases the lock cleanly instead of leaking it.
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));

    const { ENV } = await import('$lib/server/env.server.js');
    const { db } = await import('$lib/server/db/client.js');
    const { getRedis } = await import('$lib/server/redis.js');
    const { getNeo4jDriver } = await import('$lib/server/db/neo4j-client.js');
    const { getRabbitChannel, closeRabbitConnection } = await import(
      '$lib/server/queue/rabbitmq-connection.js'
    );
    const { startIdentityListener, validateListenerSetup } = await import(
      '$lib/server/dispatcher/rabbitmq-identity-listener.js'
    );

    if (!ENV.RABBITMQ_URL) {
      throw new Error(
        'RABBITMQ_URL is not configured — this worker has nothing to consume from. ' +
          'Set RABBITMQ_URL before running atlas:dispatcher:worker.'
      );
    }
    log('config_validated');

    closeRabbit = closeRabbitConnection;

    const channel = await getRabbitChannel();
    const redis = getRedis();
    redisClient = redis;
    const neo4jDriver = getNeo4jDriver();
    neo4jSession = neo4jDriver.session() as unknown as { close(): Promise<void> };
    log('dependencies_connected');

    const setup = await validateListenerSetup(channel as never);
    if (!setup.ready) {
      throw new Error(`Queue/exchange setup failed: ${setup.errors.join('; ')}`);
    }
    log('queue_bound');

    listener = await startIdentityListener(
      channel as never,
      {
        qdrantBaseUrl: ENV.QDRANT_URL,
        postgres: db,
        redis,
        neo4jSession,
        rabbitmqChannel: channel,
        logger: console,
      },
      {}
    );

    await listener.start();
    log('consumer_registered');

    // Redis heartbeat — a lightweight liveness signal consistent with other
    // sidecars in this repo (design.md: "/health endpoint (or a Redis
    // heartbeat key)"). Chose the key over standing up another HTTP port —
    // this repo already has a documented incident (this session's TurboVec
    // duplicate-bind bug) from too many independently-launched listeners;
    // adding one more port to manage for a single dispatcher worker isn't
    // worth it when a TTL'd Redis key gives the same signal more cheaply.
    // Reports process liveness only — NOT queue-consuming health, graph
    // execution health, or downstream MCP call health. See this file's
    // shutdown path for what actually gets cleaned up on exit.
    //
    // Not reused: src/lib/server/telemetry/acp-mcp-telemetry.ts — checked
    // before building this. That module models ACP routing decisions and
    // MCP tool-call spans, not queue-worker heartbeats; shoehorning this in
    // would be a worse fit than the few lines below.
    heartbeatKey = 'atlas:dispatcher:worker:heartbeat';
    const writeHeartbeat = async () => {
      try {
        await redis.set(
          heartbeatKey!,
          JSON.stringify({
            pid: process.pid,
            startedAt: new Date().toISOString(),
            status: listener?.status(),
          }),
          'EX',
          HEARTBEAT_TTL_SECONDS
        );
      } catch (e) {
        errLog('heartbeat_write_failed', { error: e instanceof Error ? e.message : String(e) });
      }
    };
    await writeHeartbeat();
    log('heartbeat_written', { heartbeatKey });
    heartbeatTimer = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);

    log('ready', { queue: 'dispatcher.identity.updated', heartbeatKey });

    if (SMOKE) {
      // Deterministic, signal-independent shutdown proof — see this file's
      // header comment for why OS signal delivery couldn't be proven live
      // in this dev environment.
      await shutdown('SMOKE_SELF_TEST');
    }
  } catch (err) {
    errLog('worker_startup_failed', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    // Reuses the same cleanup steps as shutdown() (each individually
    // guarded for partial state), but sets exitCode 1 instead of exit(0) —
    // a genuine startup failure must not be reported as a clean stop.
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    try {
      await listener?.stop();
    } catch {
      // best-effort
    }
    if (redisClient && heartbeatKey) {
      try {
        await redisClient.del(heartbeatKey);
      } catch {
        // best-effort
      }
    }
    try {
      await neo4jSession?.close();
    } catch {
      // best-effort
    }
    try {
      await closeRabbit?.();
    } catch {
      // best-effort
    }
    if (lockHeld) await releaseLock();
    process.exitCode = 1;
  }
}

main();
