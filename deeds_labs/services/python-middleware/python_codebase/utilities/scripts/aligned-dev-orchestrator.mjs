#!/usr/bin/env node
// Aligned Legal AI orchestrator with proper port configuration
// Resolves conflicts with existing services and integrates GPU inference
import { $ } from 'zx';
import { spawn } from 'child_process';
import net from 'net';
import os from 'os';
import { setTimeout as sleep } from 'timers/promises';
import fetch from 'node-fetch';
import { createWriteStream } from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createActor, createMachine, assign } from 'xstate';

// Aligned configuration with existing services
const CONFIG = {
  // Use correct ports that don't conflict
  POSTGRES_PORT: 5432,
  REDIS_PORT: 4005,
  MINIO_API_PORT: 4002,
  MINIO_CONSOLE_PORT: 4003,
  QDRANT_PORT: 6333,
  VITE_DEV_PORT: 5174,
  GRPC_PORT: 8095,
  QUIC_PORT: 8096,
  HTTP3_PORT: 8097,

  // Service commands aligned with existing setup
  POSTGRES_CMD: [
    'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_ctl.exe',
    'start',
    '-D',
    'C:\\Program Files\\PostgreSQL\\17\\data',
    '-l',
    'C:\\Program Files\\PostgreSQL\\17\\data\\postgresql.log'
  ],
  REDIS_CMD: ['redis-latest\\redis-server.exe', '--port', '4005'],
  MINIO_CMD: [
    'minio.exe',
    'server',
    '--address', ':4002',
    '--console-address', ':4003',
    './minio-data'
  ],
  VITE_CMD: [
    'npx', 'vite', 'dev',
    '--config', 'vite.config.dev.js',
    '--port', '5174',
    '--host', '0.0.0.0'
  ],
  GPU_SERVER_CMD: [
    'bin\\gpu-inference-server.exe',
    '--grpc-port=8095',
    '--quic-port=8096',
    '--http-port=8097',
    '--cuda-devices=1'
  ],

  // Service management
  MAX_RESTARTS: 3,
  RESTART_BACKOFF_MS: 2000,
  HEALTH_CHECK_INTERVAL: 10000,

  // Skip problematic services
  SKIP_QDRANT: true  // Skip since it conflicts
};

const log = createWriteStream('./aligned-orchestrator.log', { flags: 'a' });

function logConsole(msg) {
  const timestamp = new Date().toISOString();
  const logMsg = `[orchestrator] ${timestamp} ${msg}`;
  console.log(logMsg);
  log.write(logMsg + '\\n');
}

// Port conflict checker
async function checkPortConflict(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close();
      resolve(false); // Port is free
    });
    server.on('error', () => {
      resolve(true); // Port is occupied
    });
  });
}

// Service health checker
async function checkServiceHealth(url, timeout = 5000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      signal: controller.signal,
      method: 'GET'
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Service state machine
const serviceMachine = createMachine({
  id: 'service',
  initial: 'checking',
  context: {
    name: '',
    port: 0,
    restarts: 0,
    process: null,
    lastError: null
  },
  states: {
    checking: {
      invoke: {
        src: 'checkService',
        onDone: {
          target: 'running',
          cond: 'isHealthy'
        },
        onError: {
          target: 'starting'
        }
      }
    },
    starting: {
      invoke: {
        src: 'startService',
        onDone: {
          target: 'running',
          actions: assign({
            restarts: ({ context }) => context.restarts + 1
          })
        },
        onError: {
          target: 'backoff',
          actions: assign({
            lastError: ({ event }) => event.data
          })
        }
      }
    },
    running: {
      after: {
        [CONFIG.HEALTH_CHECK_INTERVAL]: {
          target: 'checking'
        }
      },
      on: {
        SERVICE_FAILED: {
          target: 'backoff',
          cond: 'canRestart'
        }
      }
    },
    backoff: {
      after: {
        [CONFIG.RESTART_BACKOFF_MS]: {
          target: 'starting',
          cond: 'canRestart'
        }
      }
    },
    failed: {
      type: 'final'
    }
  }
});

// Service definitions with proper alignment
const services = [
  {
    name: 'postgres',
    port: CONFIG.POSTGRES_PORT,
    cmd: CONFIG.POSTGRES_CMD,
    healthUrl: null, // Custom health check
    essential: true,
    customHealthCheck: async () => {
      try {
        const { $ } = await import('zx');
        const result = await $`"C:\\Program Files\\PostgreSQL\\17\\bin\\pg_ctl.exe" status -D "C:\\Program Files\\PostgreSQL\\17\\data"`.quiet();
        return result.exitCode === 0;
      } catch {
        return false;
      }
    }
  },
  {
    name: 'redis',
    port: CONFIG.REDIS_PORT,
    cmd: CONFIG.REDIS_CMD,
    healthUrl: null, // Custom health check
    essential: true,
    customHealthCheck: async () => {
      try {
        const { $ } = await import('zx');
        const result = await $`redis-latest\\redis-cli.exe -p ${CONFIG.REDIS_PORT} ping`.quiet();
        return result.stdout.trim() === 'PONG';
      } catch {
        return false;
      }
    }
  },
  {
    name: 'minio',
    port: CONFIG.MINIO_API_PORT,
    cmd: CONFIG.MINIO_CMD,
    healthUrl: `http://localhost:${CONFIG.MINIO_API_PORT}/minio/health/live`,
    essential: true
  },
  {
    name: 'context7-mcp',
    port: null, // MCP doesn't use HTTP port
    cmd: ['node', 'context7-server.js'],
    cwd: 'mcp-servers',
    healthUrl: null,
    essential: false,
    customHealthCheck: async () => {
      // Check if MCP server process is running
      try {
        const { $ } = await import('zx');
        const result = await $`tasklist /fi "imagename eq node.exe" /fi "windowtitle eq *context7*"`.quiet();
        return !result.stdout.includes('No tasks');
      } catch {
        return false;
      }
    }
  },
  {
    name: 'gpu-server',
    port: CONFIG.GRPC_PORT,
    cmd: CONFIG.GPU_SERVER_CMD,
    cwd: 'go-microservice',
    healthUrl: `http://localhost:${CONFIG.HTTP3_PORT}/health`,
    essential: false
  },
  {
    name: 'vite-dev',
    port: CONFIG.VITE_DEV_PORT,
    cmd: CONFIG.VITE_CMD,
    cwd: 'sveltekit-frontend',
    healthUrl: `http://localhost:${CONFIG.VITE_DEV_PORT}/demo/gpu-inference/api/health/webgpu`,
    essential: true,
    delay: 3000 // Give other services time to start
  }
];

// Service manager
class ServiceManager {
  constructor() {
    this.services = new Map();
    this.actors = new Map();
  }

  async initialize() {
    logConsole('🚀 Initializing aligned Legal AI orchestrator...');

    for (const serviceConfig of services) {
      const actor = createActor(serviceMachine, {
        input: serviceConfig,
        services: {
          checkService: async ({ input }) => {
            if (input.customHealthCheck) {
              return await input.customHealthCheck();
            }
            if (input.healthUrl) {
              return await checkServiceHealth(input.healthUrl);
            }
            if (input.port) {
              return !(await checkPortConflict(input.port));
            }
            return true;
          },
          startService: async ({ input }) => {
            logConsole(`🔄 Starting ${input.name}...`);

            if (input.delay) {
              await sleep(input.delay);
            }

            // Start the service process
            const process = spawn(input.cmd[0], input.cmd.slice(1), {
              cwd: input.cwd || process.cwd(),
              stdio: ['pipe', 'pipe', 'pipe'],
              shell: process.platform === 'win32'
            });

            // Store process reference
            this.services.set(input.name, {
              ...input,
              process
            });

            // Handle process output
            process.stdout?.on('data', (data) => {
              logConsole(`[${input.name}:OUT] ${data.toString().trim()}`);
            });

            process.stderr?.on('data', (data) => {
              logConsole(`[${input.name}:ERR] ${data.toString().trim()}`);
            });

            process.on('exit', (code, signal) => {
              logConsole(`${input.name} exit code ${code} sig ${signal}`);
              if (code !== 0) {
                actor.send({ type: 'SERVICE_FAILED' });
              }
            });

            // Wait for service to be ready
            await sleep(2000);

            return process;
          }
        },
        guards: {
          isHealthy: ({ event }) => event.output === true,
          canRestart: ({ context }) => context.restarts < CONFIG.MAX_RESTARTS
        }
      });

      this.actors.set(serviceConfig.name, actor);
      actor.start();
    }
  }

  async shutdown() {
    logConsole('🛑 Shutting down all services...');

    for (const [name, service] of this.services) {
      if (service.process && !service.process.killed) {
        logConsole(`Stopping ${name}...`);
        service.process.kill();
      }
    }

    for (const [name, actor] of this.actors) {
      actor.stop();
    }
  }

  getStatus() {
    const status = {};
    for (const [name, actor] of this.actors) {
      status[name] = {
        state: actor.getSnapshot().value,
        restarts: actor.getSnapshot().context.restarts,
        lastError: actor.getSnapshot().context.lastError
      };
    }
    return status;
  }
}

// Main execution
async function main() {
  logConsole('🚀 Starting aligned Legal AI development environment...');
  logConsole('Using working batch orchestrator instead of Node.js implementation');
  
  try {
    // Use the working Windows batch orchestrator
    const { $ } = await import('zx');
    
    logConsole('🔄 Executing UNIFIED-LEGAL-AI-ORCHESTRATOR.bat...');
    await $`cmd /c "UNIFIED-LEGAL-AI-ORCHESTRATOR.bat"`;
    
  } catch (error) {
    logConsole(`❌ Error running orchestrator: ${error.message}`);
    logConsole('💡 Try running UNIFIED-LEGAL-AI-ORCHESTRATOR.bat directly');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

// --- Pre-start sync: optional symlink/copy from organized-files ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

async function pathExists(p) {
  try { await fsp.access(p); return true } catch { return false }
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function isDir(p) {
  const st = await fsp.lstat(p);
  return st.isDirectory();
}

async function copyRecursive(src, dst) {
  const st = await fsp.lstat(src);
  if (st.isDirectory()) {
    await ensureDir(dst);
    const entries = await fsp.readdir(src);
    for (const e of entries) {
      await copyRecursive(path.join(src, e), path.join(dst, e));
    }
  } else {
    await ensureDir(path.dirname(dst));
    await fsp.copyFile(src, dst);
  }
}

async function linkOrCopy(src, dst, mode) {
  if (!(await pathExists(src))) {
    logConsole(`⚠️  organized-files source missing: ${src}`);
    return;
  }
  if (await pathExists(dst)) {
    // Leave existing targets in place to avoid unintended overwrites
    logConsole(`↩️  target exists, skipping: ${dst}`);
    return;
  }
  const dir = path.dirname(dst);
  await ensureDir(dir);
  if (mode === 'symlink') {
    try {
      const type = (await isDir(src)) ? 'junction' : 'file'; // junction for Windows dirs
      await fsp.symlink(src, dst, type);
      logConsole(`🔗 symlinked ${src} -> ${dst}`);
      return;
    } catch (e) {
      logConsole(`⚠️  symlink failed (${e.code}), falling back to copy: ${src} -> ${dst}`);
    }
  }
  await copyRecursive(src, dst);
  logConsole(`📄 copied ${src} -> ${dst}`);
}

async function syncOrganizedFiles() {
  try {
    const mapPath = path.join(repoRoot, 'scripts', 'organized-files-map.json');
    if (!(await pathExists(mapPath))) {
      logConsole('ℹ️  no organized-files map found; skipping sync');
      return;
    }
    const raw = await fsp.readFile(mapPath, 'utf8');
    const items = JSON.parse(raw);
    if (!Array.isArray(items) || items.length === 0) {
      logConsole('ℹ️  organized-files map empty; nothing to sync');
      return;
    }
    logConsole(`🧩 syncing organized-files (${items.length} items)`);
    for (const it of items) {
      const { from, to, mode = 'symlink' } = it;
      if (!from || !to) { continue }
      const absFrom = path.resolve(repoRoot, from);
      const absTo = path.resolve(repoRoot, to);
      await linkOrCopy(absFrom, absTo, mode);
    }
  } catch (e) {
    logConsole(`⚠️  organized-files sync error: ${e.message}`);
  }
}