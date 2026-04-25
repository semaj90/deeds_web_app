#!/usr/bin/env node

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

console.log('🚀 Starting Unified Legal AI Services...');
console.log('════════════════════════════════════════');

const services = [
  {
    name: 'RabbitMQ',
    command: 'sc',
    args: ['start', 'RabbitMQ'],
    description: 'Starting RabbitMQ message broker on ports 5672/15672',
    required: false,
    windows_service: true,
  },
  {
    name: 'Redis Cache',
    command: 'node',
    args: ['scripts/start-redis.js'],
    description: 'Starting Redis cache server on port 4005',
    required: true,
  },
  {
    name: 'PostgreSQL',
    command: 'echo',
    args: ['PostgreSQL assumed running on port 5432'],
    description: 'PostgreSQL with pgvector extension',
    required: true,
  },
  {
    name: 'MinIO',
    command: 'echo',
    args: ['MinIO assumed running on port 9000'],
    description: 'MinIO object storage server',
    required: true,
  },
  {
    name: 'Qdrant',
    command: 'echo',
    args: ['Qdrant assumed running on port 6333'],
    description: 'Qdrant vector database server',
    required: true,
  },
  {
    name: 'Neo4j',
    command: 'echo',
    args: ['Neo4j assumed running on port 7687'],
    description: 'Neo4j graph database for recommendations',
    required: false,
  },
  {
    name: 'SvelteKit Frontend',
    command: 'npm',
    args: ['run', 'dev'],
    description: 'Legal AI frontend with unified services',
    required: true,
    delay: 5000,
    env: {
      ...globalThis.process.env,
      DATABASE_URL: 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db',
    },
  },
];

async function startService(service) {
  console.log(`📍 ${service.name}: ${service.description}`);

  if (service.delay) {
    console.log(`⏳ Waiting ${service.delay}ms before starting ${service.name}...`);
    await setTimeout(service.delay);
  }

  const serviceEnv = service.env || globalThis.process.env;
  const childProcess = spawn(service.command, service.args, {
    stdio: service.name === 'SvelteKit Frontend' ? 'inherit' : 'pipe',
    shell: true,
    env: serviceEnv,
  });

  childProcess.on('error', (error) => {
    if (service.required) {
      console.error(`❌ Required service ${service.name} failed:`, error.message);
    } else {
      console.warn(`⚠️  Optional service ${service.name} failed:`, error.message);
    }
  });

  childProcess.on('close', (code) => {
    if (code !== 0 && service.required) {
      console.error(`❌ Required service ${service.name} exited with code ${code}`);
    }
  });

  return childProcess;
}

async function startAllServices() {
  const processes = [];

  for (const service of services) {
    try {
      const proc = await startService(service);
      processes.push(proc);

      // Give each service time to start
      await setTimeout(1000);
    } catch (error) {
      console.error(`Failed to start ${service.name}:`, error);
    }
  }

  console.log('✅ All services started');
  console.log('🌐 Access your unified legal AI system at http://localhost:5173');
  console.log('📊 Health check: http://localhost:5173/api/unified/health');

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\\n🛑 Shutting down unified services...');
    processes.forEach((proc) => {
      if (proc && !proc.killed) {
        proc.kill('SIGTERM');
      }
    });
    process.exit(0);
  });
}

startAllServices().catch(console.error);
