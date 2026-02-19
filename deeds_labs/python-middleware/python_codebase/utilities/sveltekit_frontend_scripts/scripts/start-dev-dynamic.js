#!/usr/bin/env node

import { spawn } from 'child_process';
import { findFreePort } from './find-free-port.js';
import chalk from 'chalk';

const PREFERRED_PORT = parseInt(process.env.PORT) || 5173;
const SIMD_DEFAULT_PORT =
  parseInt(process.env.SIMD_JSON_PORT || process.env.RAG_ENDPOINT_PORT) || 8095;
// Allow callers to override search depth via env (useful in CI or port-constrained hosts)
const MAX_PORT_TRIES = parseInt(process.env.MAX_PORT_TRIES) || 50;

async function startDevServer() {
  console.log(chalk.cyan('\n🔍 Checking for available port...\n'));

  try {
    // Check if Docker Redis is running
    const dockerRedisRunning = await (async () => {
      try {
        const { spawn } = await import('child_process');
        return new Promise((resolve) => {
          const docker = spawn(
            'docker',
            ['ps', '--filter', 'name=legal-ai-redis', '--format', '{{.Names}}'],
            {
              stdio: 'pipe',
            }
          );

          let output = '';
          docker.stdout.on('data', (data) => {
            output += data.toString();
          });

          docker.on('close', (code) => {
            resolve(output.includes('legal-ai-redis'));
          });

          docker.on('error', () => {
            resolve(false);
          });
        });
      } catch {
        return false;
      }
    })();

    // Only set REDIS_PASSWORD if Docker Redis is NOT running (for local Redis)
    const effectiveRedisPassword = dockerRedisRunning ? undefined : (process.env.REDIS_PASSWORD || 'redis');

    // Debug: show critical env vars in the parent process to validate cross-env propagation
    console.log(
      '\n🔒 DEBUG ENV: REDIS_PASSWORD=',
      effectiveRedisPassword || '(none - Docker Redis)',
      ' DEV_BYPASS_AUTH=',
      process.env.DEV_BYPASS_AUTH,
      '\n'
    );

    // Pass MAX_PORT_TRIES through to the finder (it will clamp defensively)
    const availablePort = await findFreePort(PREFERRED_PORT, MAX_PORT_TRIES);
    const simdPort = await findFreePort(SIMD_DEFAULT_PORT, MAX_PORT_TRIES);

    if (availablePort !== PREFERRED_PORT) {
      console.log(chalk.yellow(`⚠️  Port ${PREFERRED_PORT} is in use`));
      console.log(chalk.green(`✅ Using fallback port: ${availablePort}\n`));
    } else {
      console.log(chalk.green(`✅ Port ${PREFERRED_PORT} is available\n`));
    }

    if (simdPort !== SIMD_DEFAULT_PORT) {
      console.log(chalk.yellow(`⚠️  SIMD service port ${SIMD_DEFAULT_PORT} is in use`));
      console.log(chalk.green(`✅ SIMD service fallback port: ${simdPort}\n`));
    } else {
      console.log(chalk.green(`✅ SIMD service port ${SIMD_DEFAULT_PORT} is available\n`));
    }

    // Start Redis checker first
    const redisProcess = spawn('node', ['scripts/start-redis.js'], {
      stdio: 'inherit',
      shell: true,
      // Explicitly forward Redis and dev auth env vars for downstream processes
      env: {
        ...process.env,
        FORCE_COLOR: '1',
        REDIS_PASSWORD: effectiveRedisPassword,
        DEV_BYPASS_AUTH: process.env.DEV_BYPASS_AUTH,
        DATABASE_URL:
          process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db',
      },
    });

    // Give Redis a moment to initialize
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Start SIMD Go microservice (preferring compiled binary inside the helper)
    const simdProcess = spawn('node', ['../scripts/start-simd-go-service.mjs'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        FORCE_COLOR: '1',
        SIMD_JSON_PORT: simdPort.toString(),
      },
    });

    // Start Vite with the available port
    const viteProcess = spawn(
      'vite',
      ['dev', '--host', '0.0.0.0', '--port', availablePort.toString(), '--strictPort', 'false'],
      {
        stdio: 'inherit',
        shell: true,
        // Forward REDIS_PASSWORD and DEV_BYPASS_AUTH explicitly so the Vite/SvelteKit process can access them
        env: {
          ...process.env,
          FORCE_COLOR: '1',
          VITE_PORT: availablePort.toString(),
          REDIS_PASSWORD: effectiveRedisPassword,
          DEV_BYPASS_AUTH: process.env.DEV_BYPASS_AUTH,
          DATABASE_URL:
            process.env.DATABASE_URL ||
            'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db',
        },
      }
    );

    // Handle graceful shutdown
    const shutdown = (signal) => {
      console.log(chalk.yellow(`\n\n🛑 Received ${signal}, shutting down gracefully...\n`));

      redisProcess.kill('SIGTERM');
      simdProcess.kill('SIGTERM');
      viteProcess.kill('SIGTERM');

      setTimeout(() => {
        redisProcess.kill('SIGKILL');
        simdProcess.kill('SIGKILL');
        viteProcess.kill('SIGKILL');
        process.exit(0);
      }, 5000);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Monitor process exits
    redisProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.log(chalk.red(`❌ Redis process exited with code ${code}`));
      }
    });

    simdProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.log(chalk.red(`❌ SIMD service exited with code ${code}`));
      }
    });

    viteProcess.on('exit', (code) => {
      console.log(chalk.yellow(`\n🛑 Vite server stopped (exit code: ${code})\n`));
      redisProcess.kill('SIGTERM');
      simdProcess.kill('SIGTERM');
      process.exit(code || 0);
    });
  } catch (error) {
    console.error(chalk.red(`\n❌ Failed to start dev server: ${error.message}\n`));
    process.exit(1);
  }
}

// Start the server
startDevServer().catch((err) => {
  console.error(chalk.red(`\n❌ Startup error: ${err.message}\n`));
  process.exit(1);
});
