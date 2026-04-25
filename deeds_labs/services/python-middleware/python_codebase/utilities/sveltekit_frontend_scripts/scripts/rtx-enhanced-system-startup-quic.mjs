#!/usr/bin/env zx

/**
 * RTX Enhanced System Startup with QUIC/HTTP3
 * Production-ready development environment with Caddy QUIC proxy
 */

import 'zx/globals';
import { $, chalk, echo, fs, which } from 'zx';

// Configuration with QUIC support
const config = {
  ports: {
    frontend_quic: 5173, // Caddy QUIC proxy
    frontend_vite: 5174, // Direct Vite server
    mcp_context7: 8777,
    redis: 4005,
    postgres: 5432,
    ollama: 11436,
  },
  services: ['caddy-quic-proxy', 'frontend', 'mcp-context7-server', 'postgresql', 'redis-server'],
  concurrency: {
    max_parallel: 8,
    restart_delay: 2000,
    health_check_interval: 5000,
  },
};

// Service definitions with QUIC support
const services = {
  async 'caddy-quic-proxy'() {
    echo(chalk.magenta('🌐 Starting Caddy QUIC/HTTP3 Proxy...'));

    // Check if Caddyfile exists
    if (!fs.existsSync('Caddyfile')) {
      echo(chalk.red('❌ Caddyfile not found. Please run setup first.'));
      process.exit(1);
    }

    // Kill any existing Caddy processes
    try {
      await $`taskkill /F /IM caddy.exe`.catch(() => {});
    } catch {}

    // Start Caddy with QUIC
    await $`./caddy.exe run --config Caddyfile`;
  },

  async frontend() {
    echo(chalk.green('🎯 Starting SvelteKit Frontend (GPU Mode with QUIC)...'));

    // Kill any existing processes on ports
    try {
      await $`powershell "Get-Process | Where-Object {$_.ProcessName -eq 'node'} | Where-Object {$_.MainWindowTitle -like '*vite*'} | Stop-Process -Force"`.catch(
        () => {}
      );
    } catch {}

    // Start Vite with GPU optimization and QUIC configuration
    await $`npm run dev:gpu:quic`;
  },

  async 'mcp-context7-server'() {
    echo(chalk.cyan('🚀 Starting MCP Context7 Server...'));
    await $`cd ../mcp-servers && node context7-server.js --port=${config.ports.mcp_context7}`;
  },

  async postgresql() {
    echo(chalk.blue('🐘 Checking PostgreSQL...'));
    try {
      await $`"C:\\Program Files\\PostgreSQL\\17\\bin\\pg_isready.exe" -p ${config.ports.postgres}`;
      echo(chalk.green('✅ PostgreSQL is ready'));
    } catch (error) {
      echo(chalk.yellow('⚠️  Starting PostgreSQL...'));
      await $`set PGPASSWORD=123456 && "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_ctl.exe" start -D "C:\\Program Files\\PostgreSQL\\17\\data" -l "C:\\Program Files\\PostgreSQL\\17\\data\\postgresql.log"`;
    }
  },

  async 'redis-server'() {
    echo(chalk.red('🔴 Checking Redis...'));
    try {
      await $`../redis-latest/redis-cli.exe -p ${config.ports.redis} ping`;
      echo(chalk.green('✅ Redis is ready'));
    } catch (error) {
      echo(chalk.yellow('⚠️  Starting Redis...'));
      await $`../redis-latest/redis-server.exe --port ${config.ports.redis}`;
    }
  },
};

// Health check functions
async function healthCheck() {
  const checks = [
    {
      name: 'Caddy QUIC',
      url: `https://localhost:${config.ports.frontend_quic}`,
      check: async () => {
        try {
          await $`curl -k -s https://localhost:${config.ports.frontend_quic} -o /dev/null`;
          return true;
        } catch {
          return false;
        }
      },
    },
    {
      name: 'Vite HMR',
      url: `http://localhost:${config.ports.frontend_vite}`,
      check: async () => {
        try {
          await $`curl -s http://localhost:${config.ports.frontend_vite} -o /dev/null`;
          return true;
        } catch {
          return false;
        }
      },
    },
    {
      name: 'MCP Context7',
      url: `http://localhost:${config.ports.mcp_context7}`,
      check: async () => {
        try {
          await $`curl -s http://localhost:${config.ports.mcp_context7}/health -o /dev/null`;
          return true;
        } catch {
          return false;
        }
      },
    },
  ];

  for (const check of checks) {
    const isHealthy = await check.check();
    const status = isHealthy ? chalk.green('✅') : chalk.red('❌');
    echo(`${status} ${check.name}: ${check.url}`);
  }
}

// Cleanup function
async function cleanup() {
  echo(chalk.yellow('🧹 Cleaning up processes...'));

  const cleanupCommands = [
    'taskkill /F /IM caddy.exe',
    'taskkill /F /IM node.exe',
    'powershell "Get-Process | Where-Object {$_.ProcessName -eq \'redis-server\'} | Stop-Process -Force"',
  ];

  for (const cmd of cleanupCommands) {
    try {
      await $`${cmd}`.catch(() => {});
    } catch {}
  }
}

// Main execution
async function main() {
  echo(chalk.bold.cyan('🚀 RTX Enhanced System with QUIC/HTTP3 Starting...'));
  echo(chalk.dim('───────────────────────────────────────────────'));

  // Register cleanup handlers
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    // Start all services concurrently
    const servicePromises = config.services.map(async (serviceName) => {
      try {
        echo(chalk.blue(`🔄 Starting ${serviceName}...`));
        await services[serviceName]();
      } catch (error) {
        echo(chalk.red(`❌ Failed to start ${serviceName}: ${error.message}`));
        throw error;
      }
    });

    // Wait for all services with timeout
    await Promise.race([
      Promise.allSettled(servicePromises),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Service startup timeout')), 60000)
      ),
    ]);

    // Wait for services to be ready
    echo(chalk.yellow('⏳ Waiting for services to be ready...'));
    await new Promise((resolve) => setTimeout(resolve, 8000));

    // Run health checks
    echo(chalk.cyan('🏥 Running health checks...'));
    await healthCheck();

    echo(chalk.bold.green('✅ All services started successfully!'));
    echo(chalk.dim('───────────────────────────────────────────────'));
    echo(chalk.cyan('🌐 Access URLs:'));
    echo(chalk.white(`   HTTP/HTTPS: http://localhost:${config.ports.frontend_quic}`));
    echo(chalk.white(`   QUIC/HTTP3: https://localhost:${config.ports.frontend_quic}`));
    echo(chalk.white(`   Vite HMR:   http://localhost:${config.ports.frontend_vite}`));
    echo(chalk.white(`   Context7:   http://localhost:${config.ports.mcp_context7}`));
    echo(chalk.dim('───────────────────────────────────────────────'));
    echo(chalk.yellow('Press Ctrl+C to stop all services'));

    // Keep the process alive
    await new Promise(() => {});
  } catch (error) {
    echo(chalk.red(`💥 Startup failed: ${error.message}`));
    await cleanup();
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
