#!/usr/bin/env node
import { spawn, execSync } from 'child_process';
import net from 'net';
import os from 'os';
import path from 'path';

const CWD = process.cwd();
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:4005';
const RABBIT_HOST = process.env.RABBIT_HOST || '127.0.0.1';
const RABBIT_PORT = Number(process.env.RABBIT_PORT || 5672);

function parseRedisHostPort(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: Number(u.port || 4005) };
  } catch (e) {
    return { host: '127.0.0.1', port: 4005 };
  }
}

function checkTcp(host, port, timeout = 2000) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    sock.setTimeout(timeout);
    sock.once('error', () => {
      if (!done) {
        done = true;
        sock.destroy();
        resolve(false);
      }
    });
    sock.once('timeout', () => {
      if (!done) {
        done = true;
        sock.destroy();
        resolve(false);
      }
    });
    sock.connect(port, host, () => {
      if (!done) {
        done = true;
        sock.end();
        resolve(true);
      }
    });
  });
}

async function tryStartRabbitOnWindows() {
  try {
    console.log('Attempting to start RabbitMQ service (Windows)...');
    execSync('net start RabbitMQ', { stdio: 'inherit' });
  } catch (e) {
    console.log('net start RabbitMQ failed or service not installed.');
  }
}

async function tryStartRedisBinary() {
  // if ../redis-latest/redis-server.exe exists, start it
  const bin = path.resolve(
    CWD,
    '..',
    'redis-latest',
    os.platform() === 'win32' ? 'redis-server.exe' : 'redis-server'
  );
  try {
    // eslint-disable-next-line no-unused-expressions
    require('fs').accessSync(bin);
    console.log('Found redis-server binary at', bin, '- starting on port 4005');
    spawn(bin, ['--port', '4005'], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) {
    // no-op
  }
}

async function main() {
  console.log('┌─ Coordinated Full Stack Startup ─────────────────────────────────────┐');
  console.log('│ Checking service readiness and orchestrating frontend + worker...    │');
  console.log('└──────────────────────────────────────────────────────────────────────┘');

  const { host: redisHost, port: redisPort } = parseRedisHostPort(REDIS_URL);
  console.log('Checking Redis at', redisHost + ':' + redisPort, ' (REDIS_URL=', REDIS_URL, ')');
  const redisOk = await checkTcp(redisHost, redisPort, 1500);
  if (!redisOk) {
    console.warn('Redis not reachable at', redisHost + ':' + redisPort);
    if (os.platform() === 'win32') await tryStartRedisBinary();
  } else {
    console.log('Redis reachable ✅');
  }

  console.log('Checking RabbitMQ at', RABBIT_HOST + ':' + RABBIT_PORT);
  const rabbitOk = await checkTcp(RABBIT_HOST, RABBIT_PORT, 1500);
  if (!rabbitOk) {
    console.warn('RabbitMQ not reachable at', RABBIT_HOST + ':' + RABBIT_PORT);
    if (os.platform() === 'win32') await tryStartRabbitOnWindows();
  } else {
    console.log('RabbitMQ reachable ✅');
  }

  // Start worker and frontend
  console.log('\nStarting worker (embedding consumer)...');
  const worker = spawn(process.execPath, [path.resolve(CWD, 'start-worker.js')], {
    stdio: 'inherit',
    env: { ...process.env },
  });

  console.log('\nStarting frontend (vite dev)...');
  const frontend = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], {
    stdio: 'inherit',
    env: { ...process.env },
  });

  const children = [worker, frontend];

  function shutdown(code = 0) {
    console.log('Shutting down children...');
    children.forEach((c) => {
      try {
        c.kill('SIGTERM');
      } catch {}
    });
    process.exit(code);
  }

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  worker.on('exit', (code) => {
    console.log('Worker exited with', code);
    // if worker dies, keep frontend running but warn
  });

  frontend.on('exit', (code) => {
    console.log('Frontend exited with', code);
    shutdown(code ?? 0);
  });
}

main().catch((e) => {
  console.error('Startup orchestrator failed:', e);
  process.exit(1);
});
