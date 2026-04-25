#!/usr/bin/env node
// Enhanced dev:full startup script with better error handling and port management
// Combines PostgreSQL, Ollama GPU, RTX services, and monitoring

import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Colors for console output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset', prefix = '🚀') {
  console.log(`${colors[color]}${prefix} Dev-Full: ${message}${colors.reset}`);
}

// Check if port is in use
async function isPortInUse(port) {
  try {
    const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
    return stdout.trim().length > 0;
  } catch (error) {
    return false;
  }
}

// Kill process using port
async function killPortProcess(port) {
  try {
    const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
    const lines = stdout.trim().split('\n');

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];

      if (pid && pid !== '0') {
        log(`Killing process ${pid} using port ${port}`, 'yellow', '🔧');
        await execAsync(`powershell -Command "Stop-Process -Id ${pid} -Force"`);
      }
    }
  } catch (error) {
    log(`Could not kill port ${port}: ${error.message}`, 'yellow', '⚠️');
  }
}

// Start service with proper error handling
function startService(name, command, args, options = {}) {
  return new Promise((resolve, reject) => {
    log(`Starting ${name}...`, 'blue', '🚀');

    const child = spawn(command, args, {
      stdio: options.silent ? 'ignore' : 'inherit',
      shell: true,
      ...options,
    });

    let hasStarted = false;

    child.on('spawn', () => {
      if (!hasStarted) {
        hasStarted = true;
        log(`✅ ${name} started successfully`, 'green', '✅');
        resolve(child);
      }
    });

    child.on('error', (error) => {
      if (!hasStarted) {
        log(`❌ Failed to start ${name}: ${error.message}`, 'red', '❌');
        reject(error);
      }
    });

    // Timeout fallback
    setTimeout(() => {
      if (!hasStarted) {
        hasStarted = true;
        log(`⚡ ${name} startup timeout - assuming success`, 'yellow', '⚡');
        resolve(child);
      }
    }, options.timeout || 5000);
  });
}

// Main execution
async function main() {
  try {
    log('🎉 Starting Enhanced Legal AI Development Stack', 'bold', '🎉');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan', '');

    const services = [];

    // 1. Clear any conflicting ports
    log('🔧 Checking for port conflicts...', 'yellow', '🔧');
    const conflictPorts = [5173, 4005, 6379, 8080];

    for (const port of conflictPorts) {
      if (await isPortInUse(port)) {
        log(`Port ${port} is in use - clearing...`, 'yellow', '🔧');
        await killPortProcess(port);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // 2. Start PostgreSQL
    try {
      const pgService = await startService(
        'PostgreSQL Database',
        'node',
        ['scripts/start-postgres.js'],
        { timeout: 8000 }
      );
      services.push(pgService);
    } catch (error) {
      log('PostgreSQL startup failed - continuing anyway', 'yellow', '⚠️');
    }

    // 3. Start Ollama GPU
    try {
      log('🦙 Checking Ollama status...', 'yellow', '🦙');
      const ollamaRunning = await execAsync('curl -s http://localhost:11435/api/tags', {
        timeout: 3000,
      });

      if (ollamaRunning.stdout.includes('models')) {
        log('✅ Ollama already running with GPU acceleration', 'green', '✅');
      } else {
        const ollamaService = await startService(
          'Ollama GPU Assistant',
          'node',
          ['scripts/start-ollama-gpu.js'],
          { timeout: 10000 }
        );
        services.push(ollamaService);
      }
    } catch (error) {
      log('⚠️ Ollama startup failed - AI features may be limited', 'yellow', '⚠️');
    }

    // 4. Start RTX Services (but modified to avoid port conflicts)
    try {
      log('⚡ Starting SvelteKit with RTX optimization...', 'cyan', '⚡');

      // Use npm run command with RTX optimization
      const viteService = await startService('SvelteKit RTX Frontend', 'npm', ['run', 'dev:gpu'], {
        timeout: 15000,
      });
      services.push(viteService);
    } catch (error) {
      log('❌ RTX SvelteKit startup failed', 'red', '❌');
      throw error;
    }

    // 5. Start GPU Monitor (background)
    try {
      setTimeout(async () => {
        const monitorService = await startService('GPU Monitor', 'npm', ['run', 'gpu:monitor'], {
          silent: true,
          timeout: 3000,
        });
        services.push(monitorService);
      }, 3000);
    } catch (error) {
      log('⚠️ GPU monitor failed to start', 'yellow', '⚠️');
    }

    // Success summary
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'green', '');
    log('🎉 Enhanced Legal AI Stack Running Successfully!', 'bold', '🎉');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'green', '');
    log('🌐 Frontend: http://localhost:5173', 'cyan', '🌐');
    log('🐘 PostgreSQL: localhost:5432 (legal_ai_db)', 'blue', '🐘');
    log('🦙 Ollama AI: http://localhost:11435', 'yellow', '🦙');
    log('📊 Health Check: http://localhost:5173/api/test/mock-sync', 'magenta', '📊');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'green', '');

    // Keep process running
    process.stdin.resume();
  } catch (error) {
    log(`❌ Startup failed: ${error.message}`, 'red', '❌');
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  log('👋 Shutting down Enhanced Legal AI Stack...', 'yellow', '👋');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('👋 Enhanced Legal AI Stack terminated', 'yellow', '👋');
  process.exit(0);
});

// Run
main();
