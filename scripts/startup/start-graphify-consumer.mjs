#!/usr/bin/env node
/**
 * Start Graphify Audit Consumer in Background
 *
 * Spawns the RabbitMQ consumer as a detached process that survives
 * the parent process exit. Logs output to .tmp/graphify-consumer.log
 *
 * Usage:
 *   npm run turbo:start:graphify-consumer
 *   or
 *   node scripts/startup/start-graphify-consumer.mjs [--verbose]
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const LOG_DIR = path.join(ROOT, '.tmp');
const LOG_FILE = path.join(LOG_DIR, 'graphify-consumer.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Prepare log stream
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  logStream.write(line + '\n');
}

log('🚀 Starting Graphify Audit Consumer...');

// Parse args
const verbose = process.argv.includes('--verbose');
const args = ['run', 'worker:graphify:consume'];
if (verbose) args.push('--verbose');

log(`Command: npm ${args.join(' ')}`);

// Spawn as detached process (will survive parent exit)
const proc = spawn('npm', args, {
  cwd: ROOT,
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true
});

// Pipe output to log file
proc.stdout.pipe(logStream);
proc.stderr.pipe(logStream);

proc.on('error', (err) => {
  log(`✗ Failed to start consumer: ${err.message}`);
  process.exit(1);
});

// Unref allows parent to exit
proc.unref();

log(`✓ Consumer spawned with PID ${proc.pid}`);
log(`✓ Logs: ${LOG_FILE}`);
log('\n✅ Consumer running in background');

// Give process a moment to start and log initial connection messages
setTimeout(() => {
  process.exit(0);
}, 1000);
