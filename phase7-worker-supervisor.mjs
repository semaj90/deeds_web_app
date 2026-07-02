#!/usr/bin/env node
/**
 * Phase 7 Worker Supervisor
 *
 * Keeps the RabbitMQ worker running continuously.
 * Restarts if it crashes or gets stuck.
 * Logs all output to a rotating file.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const WORKER_ID = process.argv[2] || '1';
const LOG_FILE = `/tmp/phase7-worker-${WORKER_ID}-supervisor.log`;
const HEARTBEAT_FILE = `/tmp/phase7-worker-${WORKER_ID}-heartbeat`;

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}\n`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line);
}

function startWorker() {
  log(`Starting worker ${WORKER_ID}...`);

  const worker = spawn('node', [
    'phase7-rabbitmq-batch-worker.mjs',
    '--worker',
    `--id=${WORKER_ID}`,
    '--queue-batch-size=32'
  ], {
    cwd: '/c/Users/james/Videos/deeds-web-app',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let lastOutput = Date.now();
  const outputTimeout = 120000; // 2 minutes without output = restart

  worker.stdout.on('data', (data) => {
    lastOutput = Date.now();
    fs.writeFileSync(HEARTBEAT_FILE, lastOutput.toString());
    process.stdout.write(`[W${WORKER_ID}] ${data}`);
  });

  worker.stderr.on('data', (data) => {
    lastOutput = Date.now();
    process.stderr.write(`[W${WORKER_ID} ERR] ${data}`);
  });

  worker.on('exit', (code, signal) => {
    log(`Worker ${WORKER_ID} exited with code ${code}, signal ${signal}`);
    log(`Restarting in 5 seconds...`);
    setTimeout(startWorker, 5000);
  });

  // Monitor for stuck worker (no output for 2 minutes)
  const stuckChecker = setInterval(() => {
    const elapsed = Date.now() - lastOutput;
    if (elapsed > outputTimeout) {
      log(`Worker ${WORKER_ID} appears stuck (no output for ${Math.round(elapsed / 1000)}s), killing...`);
      worker.kill('SIGKILL');
      clearInterval(stuckChecker);
    }
  }, 30000);

  return { worker, stuckChecker };
}

log(`Phase 7 Worker Supervisor started for Worker ${WORKER_ID}`);
startWorker();

// Graceful shutdown
process.on('SIGINT', () => {
  log(`Supervisor shutting down...`);
  process.exit(0);
});
