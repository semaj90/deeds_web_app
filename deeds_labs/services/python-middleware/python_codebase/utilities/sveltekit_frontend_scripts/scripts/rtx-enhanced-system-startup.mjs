#!/usr/bin/env zx

/**
 * RTX Enhanced System Startup
 * Production-ready development environment with concurrency and MCP Context7 integration
 */

import 'zx/globals';
import { $, chalk, echo, fs, which } from 'zx';

// Configuration
const config = {
  ports: {
    frontend: 5173,
    mcp_context7: 8777,
    redis: 4005,
    postgres: 5432,
    ollama: 11436,
  },
  services: ['frontend', 'mcp-context7-server', 'postgresql', 'redis-server'],
  concurrency: {
    max_parallel: 8,
    restart_delay: 2000,
    health_check_interval: 5000,
  },
};

// Service definitions with concurrency
const services = {
  async 'mcp-context7-server'() {
    echo(chalk.cyan('🚀 Starting MCP Context7 Server...'));
    await $`cd ../mcp-servers && node context7-server.js --port=${config.ports.mcp_context7}`;
  },

  async frontend() {
    echo(chalk.green('🎯 Starting SvelteKit Frontend...'));
    await $`npm run dev -- --port ${config.ports.frontend}`;
  },

  async postgresql() {
    echo(chalk.blue('🐘 Checking PostgreSQL...'));
    try {
      await $`pg_isready -p ${config.ports.postgres}`;
      echo(chalk.green('✅ PostgreSQL is ready'));
    } catch (error) {
      echo(chalk.yellow('⚠️  PostgreSQL not ready, attempting to start...'));
      // Attempt to start PostgreSQL on Windows
      try {
        await $`net start postgresql-x64-15`;
      } catch (e) {
        echo(chalk.red('❌ Failed to start PostgreSQL. Please start manually.'));
      }
    }
  },

  async 'redis-server'() {
    echo(chalk.red('🔴 Starting Redis Server...'));
    try {
      await $`cd .. && .\\redis-latest\\redis-cli.exe -p ${config.ports.redis} ping`;
      echo(chalk.green('✅ Redis is already running'));
    } catch (error) {
      echo(chalk.yellow('⚠️  Starting Redis...'));
      await $`cd .. && .\\redis-latest\\redis-server.exe --port ${config.ports.redis}`;
    }
  },
};

// Health check utilities
async function healthCheck(service, port) {
  try {
    switch (service) {
      case 'frontend':
        await $`curl -s http://localhost:${port}/api/health`;
        break;
      case 'mcp-context7-server':
        await $`curl -s http://localhost:${port}/health`;
        break;
      case 'postgresql':
        await $`pg_isready -p ${port}`;
        break;
      case 'redis-server':
        await $`cd .. && .\\redis-latest\\redis-cli.exe -p ${port} ping`;
        break;
    }
    return true;
  } catch (error) {
    return false;
  }
}

// Concurrency manager
class ConcurrencyManager {
  constructor(maxParallel = 8) {
    this.maxParallel = maxParallel;
    this.running = new Map();
    this.failed = new Set();
  }

  async startService(name, serviceFunc) {
    if (this.running.size >= this.maxParallel) {
      echo(
        chalk.yellow(`⏸️  Waiting for available slot (${this.running.size}/${this.maxParallel})`)
      );
      await this.waitForSlot();
    }

    echo(chalk.cyan(`🔄 Starting ${name}...`));
    this.running.set(name, true);

    try {
      await serviceFunc();
      echo(chalk.green(`✅ ${name} started successfully`));
    } catch (error) {
      echo(chalk.red(`❌ ${name} failed: ${error.message}`));
      this.failed.add(name);
    } finally {
      this.running.delete(name);
    }
  }

  async waitForSlot() {
    while (this.running.size >= this.maxParallel) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async startAllServices() {
    const promises = Object.entries(services).map(([name, serviceFunc]) =>
      this.startService(name, serviceFunc)
    );

    await Promise.allSettled(promises);

    if (this.failed.size > 0) {
      echo(chalk.red(`❌ Failed services: ${Array.from(this.failed).join(', ')}`));
      return false;
    }

    echo(chalk.green('🎉 All services started successfully!'));
    return true;
  }
}

// Main startup sequence
async function main() {
  echo(chalk.bold.cyan('🚀 RTX Enhanced System Startup'));
  echo(chalk.gray('With Concurrency, MCP Context7, and ZX Integration'));
  echo('');

  // Check prerequisites
  const requiredTools = ['node', 'npm', 'curl', 'redis-cli'];
  for (const tool of requiredTools) {
    if (!(await which(tool))) {
      echo(chalk.red(`❌ Missing required tool: ${tool}`));
      process.exit(1);
    }
  }

  // Install dependencies if needed
  if (!fs.existsSync('node_modules')) {
    echo(chalk.yellow('📦 Installing dependencies...'));
    await $`npm install`;
  }

  // Start concurrency manager
  const manager = new ConcurrencyManager(config.concurrency.max_parallel);

  // Health monitoring
  const healthMonitor = setInterval(async () => {
    const healthResults = await Promise.allSettled(
      Object.entries(config.ports).map(async ([service, port]) => {
        const isHealthy = await healthCheck(service, port);
        return { service, port, healthy: isHealthy };
      })
    );

    const healthyServices = healthResults
      .filter((r) => r.status === 'fulfilled' && r.value.healthy)
      .map((r) => r.value.service);

    if (healthyServices.length > 0) {
      echo(chalk.green(`💚 Healthy: ${healthyServices.join(', ')}`));
    }
  }, config.concurrency.health_check_interval);

  // Start all services with concurrency
  const success = await manager.startAllServices();

  if (success) {
    echo('');
    echo(chalk.bold.green('🎯 Development Environment Ready!'));
    echo(chalk.cyan(`Frontend: http://localhost:${config.ports.frontend}`));
    echo(chalk.cyan(`MCP Context7: http://localhost:${config.ports.mcp_context7}`));
    echo('');
    echo(chalk.gray('Press Ctrl+C to stop all services'));

    // Keep the process running
    process.on('SIGINT', () => {
      clearInterval(healthMonitor);
      echo(chalk.yellow('\n🔄 Shutting down services...'));
      process.exit(0);
    });

    // Keep alive
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } else {
    clearInterval(healthMonitor);
    echo(chalk.red('❌ System startup failed'));
    process.exit(1);
  }
}

// Error handling
process.on('unhandledRejection', (error) => {
  echo(chalk.red(`❌ Unhandled error: ${error.message}`));
  process.exit(1);
});

// Run main
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    echo(chalk.red(`❌ Startup failed: ${error.message}`));
    process.exit(1);
  });
}
