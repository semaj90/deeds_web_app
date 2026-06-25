#!/usr/bin/env node
/**
 * Graphify Daemon Manager
 *
 * Manages the graphify-audit-consumer worker as a background service.
 * Handles start/stop/restart/status operations with PID tracking.
 *
 * Usage:
 *   node scripts/workers/graphify-daemon-manager.mjs [start|stop|restart|status|logs]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, exec } from 'child_process';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PID_FILE = path.join(ROOT, '.tmp/graphify-daemon.pid');
const LOG_FILE = path.join(ROOT, '.tmp/graphify-daemon.log');

// Load environment
dotenv.config({ path: path.join(ROOT, '.env'), override: false });
dotenv.config({ path: path.join(ROOT, '.env.local'), override: false });

// Logging
function log(msg, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = { info: '✓', warn: '⚠', error: '✗', debug: '◆' }[level] || '•';
  console.log(`[${timestamp}] ${prefix} ${msg}`);
}

function writeLog(msg) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${msg}\n`);
}

// Ensure .tmp directory exists
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Start the daemon
async function startDaemon() {
  try {
    ensureDir(path.dirname(PID_FILE));
    ensureDir(path.dirname(LOG_FILE));

    // Check if already running
    if (fs.existsSync(PID_FILE)) {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());
      try {
        // Check if process is still alive
        process.kill(pid, 0);
        log(`Daemon already running (PID: ${pid})`, 'warn');
        return;
      } catch (err) {
        // Process not running, remove stale PID file
        fs.unlinkSync(PID_FILE);
        log('Stale PID file removed, starting fresh');
      }
    }

    log('🚀 Starting Graphify Audit Consumer daemon...');

    // Spawn the consumer as a detached child process
    const proc = spawn('node', ['scripts/workers/graphify-audit-consumer.mjs', '--verbose'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true // Allow process to run independently
    });

    // Write stdout/stderr to log file
    proc.stdout?.on('data', (data) => {
      writeLog(`[STDOUT] ${data.toString().trim()}`);
    });

    proc.stderr?.on('data', (data) => {
      writeLog(`[STDERR] ${data.toString().trim()}`);
    });

    // Save PID and allow process to exit
    fs.writeFileSync(PID_FILE, proc.pid.toString());
    proc.unref();

    log(`✓ Daemon started (PID: ${proc.pid})`);
    log(`  Log file: ${LOG_FILE}`);
    writeLog(`Daemon started with PID ${process.pid}`);
  } catch (err) {
    log(`✗ Failed to start daemon: ${err.message}`, 'error');
    process.exit(1);
  }
}

// Stop the daemon
async function stopDaemon() {
  try {
    if (!fs.existsSync(PID_FILE)) {
      log('Daemon not running', 'warn');
      return;
    }

    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());

    try {
      process.kill(pid, 'SIGTERM');
      log(`Stopping daemon (PID: ${pid})...`);
      writeLog(`Daemon stopped by manager`);

      // Wait for process to exit
      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          try {
            process.kill(pid, 0);
          } catch (err) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);

        // Force kill after 5 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          try {
            process.kill(pid, 'SIGKILL');
          } catch (err) {
            // Already dead
          }
          resolve();
        }, 5000);
      });

      fs.unlinkSync(PID_FILE);
      log('✓ Daemon stopped');
    } catch (err) {
      log(`✗ Failed to stop daemon: ${err.message}`, 'error');
      fs.unlinkSync(PID_FILE);
    }
  } catch (err) {
    log(`✗ Error: ${err.message}`, 'error');
    process.exit(1);
  }
}

// Restart the daemon
async function restartDaemon() {
  log('Restarting daemon...');
  await stopDaemon();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await startDaemon();
}

// Check status
async function statusDaemon() {
  try {
    if (!fs.existsSync(PID_FILE)) {
      log('Daemon: not running', 'warn');
      return;
    }

    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());

    try {
      process.kill(pid, 0);
      log(`✓ Daemon running (PID: ${pid})`);

      // Try to get process info
      const cmd = process.platform === 'win32'
        ? `tasklist /FI "PID eq ${pid}" /FO TABLE /NH`
        : `ps -p ${pid} -o pid,ppid,cmd`;

      exec(cmd, (err, stdout) => {
        if (!err && stdout) {
          log(`  Process info:\n${stdout}`);
        }
      });
    } catch (err) {
      log('Daemon: not running', 'warn');
      fs.unlinkSync(PID_FILE);
    }
  } catch (err) {
    log(`✗ Error: ${err.message}`, 'error');
    process.exit(1);
  }
}

// Show logs
async function showLogs() {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      log('No logs yet');
      return;
    }

    const logs = fs.readFileSync(LOG_FILE, 'utf-8');
    const lines = logs.split('\n').slice(-50); // Last 50 lines
    console.log('\n' + '═'.repeat(70));
    console.log('DAEMON LOGS (last 50 lines)');
    console.log('═'.repeat(70) + '\n');
    console.log(lines.join('\n'));
  } catch (err) {
    log(`✗ Error reading logs: ${err.message}`, 'error');
    process.exit(1);
  }
}

// Main
async function main() {
  const command = process.argv[2] || 'status';

  switch (command) {
    case 'start':
      await startDaemon();
      break;
    case 'stop':
      await stopDaemon();
      break;
    case 'restart':
      await restartDaemon();
      break;
    case 'status':
      await statusDaemon();
      break;
    case 'logs':
      await showLogs();
      break;
    default:
      console.log(`Usage: node graphify-daemon-manager.mjs [start|stop|restart|status|logs]`);
      process.exit(1);
  }
}

main().catch((err) => {
  log(`✗ Fatal error: ${err.message}`, 'error');
  console.error(err);
  process.exit(1);
});
