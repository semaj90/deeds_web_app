#!/usr/bin/env node

/**
 * Windows-compatible development startup script
 * Simplified version without complex prerequisites
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Starting YoRHa Legal AI Development Environment');
console.log('════════════════════════════════════════════════');

// Service definitions
const services = [
  {
    name: 'PostgreSQL Check',
    command: '"C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe"',
    args: [
      '-h',
      'localhost',
      '-p',
      '5432',
      '-U',
      'postgres',
      '-d',
      'legal_ai_db',
      '-c',
      'SELECT 1;',
      '--quiet',
    ],
    env: { PGPASSWORD: '123456' },
    description: 'Database connection test',
  },
  {
    name: 'Redis Server',
    command: 'node',
    args: ['scripts/start-redis.js'],
    description: 'Starting Redis cache on port 4005',
    background: true,
  },
  {
    name: 'Redis Check',
    command: '../redis-latest/redis-cli.exe',
    args: ['-p', '4005', 'ping'],
    description: 'Redis cache connection test',
    delay: 3000,
  },
  {
    name: 'SvelteKit Frontend',
    command: 'npm',
    args: ['run', 'dev', '--', '--port', '5174'],
    description: 'Frontend development server',
  },
];

// Start services sequentially
async function startServices() {
  for (const service of services) {
    console.log(`\n🔄 ${service.name}: ${service.description}`);

    if (service.delay) {
      console.log(`⏳ Waiting ${service.delay}ms for service to be ready...`);
      await new Promise((resolve) => setTimeout(resolve, service.delay));
    }

    try {
      await runCommand(service);
      console.log(`✅ ${service.name}: Ready`);
    } catch (error) {
      console.log(`⚠️  ${service.name}: ${error.message}`);
    }
  }

  console.log('\n🎯 Development Environment Status Summary:');
  console.log('├── Database: PostgreSQL on port 5432');
  console.log('├── Cache: Redis on port 4005');
  console.log('├── Frontend: http://localhost:5174');
  console.log('└── YoRHa Legal AI: Ready for development');
  console.log('\nPress Ctrl+C to stop all services\n');
}

function runCommand(service) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(service.command, service.args, {
      shell: true,
      env: { ...process.env, ...service.env },
      stdio: service.name === 'SvelteKit Frontend' || service.background ? 'inherit' : 'pipe',
    });

    if (service.name === 'SvelteKit Frontend') {
      // Keep frontend running
      childProcess.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Process exited with code ${code}`));
        }
      });
      resolve();
    } else if (service.background) {
      // Background service - resolve immediately
      setTimeout(() => resolve(), 1000);
    } else {
      // For checks, wait for completion
      let output = '';

      childProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });

      childProcess.stderr?.on('data', (data) => {
        output += data.toString();
      });

      childProcess.on('exit', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Check failed (code ${code})`));
        }
      });

      setTimeout(() => {
        childProcess.kill();
        reject(new Error('Timeout'));
      }, 5000);
    }
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🔄 Shutting down development environment...');
  process.exit(0);
});

// Start the environment
startServices().catch((error) => {
  console.error('❌ Failed to start development environment:', error.message);
  process.exit(1);
});
