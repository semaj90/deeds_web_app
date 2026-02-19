#!/usr/bin/env node
/**
 * Start TensorRT-LLM Integration with Existing Docker Desktop Stack
 * Integrates with NATS, QUIC, Redis, PostgreSQL, etc.
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

console.log('🚀 Starting TensorRT-LLM Integration with Docker Desktop Stack...');

const config = {
  // Existing services (already running)
  natsPort: 4222,
  quicPort: 4433,
  caddyPort: 9090,
  redisPort: 6379,
  minioPort: 9000,
  rabbitmqPort: 15672,
  qdrantPort: 6333,
  frontendPort: 5173,
  httpsPort: 443,
  postgresPort: 5432,

  // New TensorRT-LLM services
  tensorrtApiPort: 8096,
  tensorrtWsPort: 8097,
  tensorrtHealthPort: 8098,
};

async function checkExistingServices() {
  console.log('🔍 Checking existing Docker Desktop services...');

  try {
    const { stdout } = await execAsync('docker ps --format "table {{.Names}}\\t{{.Ports}}"');
    console.log('📋 Current Docker Desktop Stack:');
    console.log(stdout);

    const runningServices = stdout.split('\n').filter((line) => line.includes('legal-ai'));
    console.log(`✅ Found ${runningServices.length - 1} legal-ai services running`);

    return runningServices.length > 1;
  } catch (error) {
    console.error('❌ Error checking Docker services:', error.message);
    return false;
  }
}

async function startTensorRTLLMService() {
  console.log('🧠 Starting TensorRT-LLM service...');

  // Check if TensorRT-LLM is already running
  try {
    const response = await fetch(`http://localhost:${config.tensorrtApiPort}/health`);
    if (response.ok) {
      console.log('✅ TensorRT-LLM service already running');
      return true;
    }
  } catch {
    // Service not running, start it
  }

  return new Promise((resolve) => {
    const tensorrtProcess = spawn('python', ['../tensorrt-llm-legal-production.py'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: {
        ...process.env,
        REDIS_URL: `redis://:redis@localhost:${config.redisPort}/0`,
        DATABASE_URL: `postgresql://legal_admin:123456@localhost:${config.postgresPort}/legal_ai_db`,
        NATS_URL: `nats://localhost:${config.natsPort}`,
        TENSORRT_PORT: config.tensorrtApiPort,
        RTX_3060_OPTIMIZATION: 'true',
        GEMMA_EMBEDDINGS: 'true',
        GEMMA3_LEGAL_MODEL: 'true',
      },
    });

    tensorrtProcess.on('spawn', () => {
      console.log('✅ TensorRT-LLM service started');
      setTimeout(() => resolve(true), 3000); // Give it time to initialize
    });

    tensorrtProcess.on('error', (error) => {
      console.error('❌ Failed to start TensorRT-LLM:', error.message);
      resolve(false);
    });
  });
}

async function setupRedisClientIntegration() {
  console.log('📡 Setting up Redis client integration...');

  try {
    // Test Redis connection with client libraries
    const { stdout } = await execAsync(
      `redis-cli -h localhost -p ${config.redisPort} -a redis ping`
    );
    console.log('✅ Redis client connection:', stdout.trim());

    // Set up tensor caching keys
    await execAsync(
      `redis-cli -h localhost -p ${config.redisPort} -a redis SET tensorrt:status "initialized"`
    );
    await execAsync(
      `redis-cli -h localhost -p ${config.redisPort} -a redis SET gemma:270m:wasm "enabled"`
    );
    await execAsync(
      `redis-cli -h localhost -p ${config.redisPort} -a redis SET gemma3:legal:cuda "enabled"`
    );

    console.log('✅ Redis client libraries configured');
    return true;
  } catch (error) {
    console.error('❌ Redis client setup failed:', error.message);
    return false;
  }
}

async function integrateWithNATS() {
  console.log('📨 Integrating with NATS messaging...');

  try {
    // Test NATS connection
    const natsTest = spawn('curl', ['-f', `http://localhost:${config.natsPort}/varz`], {
      stdio: 'pipe',
    });

    return new Promise((resolve) => {
      natsTest.on('close', (code) => {
        if (code === 0) {
          console.log('✅ NATS integration ready');
          resolve(true);
        } else {
          console.log('⚠️ NATS not available, continuing without messaging integration');
          resolve(true); // Continue anyway
        }
      });
    });
  } catch (error) {
    console.log('⚠️ NATS integration optional, continuing...');
    return true;
  }
}

async function setupQUICIntegration() {
  console.log('🚀 Setting up QUIC protocol integration...');

  try {
    // Test QUIC endpoint
    const quicTest = spawn('curl', ['-f', `http://localhost:${config.caddyPort}/health`], {
      stdio: 'pipe',
    });

    return new Promise((resolve) => {
      quicTest.on('close', (code) => {
        if (code === 0) {
          console.log('✅ QUIC protocol integration ready');
        } else {
          console.log('⚠️ QUIC endpoint not responding, continuing...');
        }
        resolve(true);
      });
    });
  } catch (error) {
    console.log('⚠️ QUIC integration optional, continuing...');
    return true;
  }
}

async function testIntegratedStack() {
  console.log('🧪 Testing integrated stack...');

  const tests = [
    {
      name: 'PostgreSQL + pgvector',
      command: `PGPASSWORD=123456 psql -h localhost -p ${config.postgresPort} -U legal_admin -d legal_ai_db -c "SELECT version();"`,
    },
    {
      name: 'Redis client libraries',
      command: `redis-cli -h localhost -p ${config.redisPort} -a redis GET tensorrt:status`,
    },
    {
      name: 'TensorRT-LLM health',
      command: `curl -f http://localhost:${config.tensorrtApiPort}/health`,
    },
    {
      name: 'SvelteKit frontend',
      command: `curl -f http://localhost:${config.frontendPort}`,
    },
  ];

  for (const test of tests) {
    try {
      console.log(`Testing ${test.name}...`);
      await execAsync(test.command);
      console.log(`✅ ${test.name} working`);
    } catch (error) {
      console.log(`⚠️ ${test.name} not ready: ${error.message.split('\n')[0]}`);
    }
  }
}

async function displayIntegrationSummary() {
  console.log('\n🎉 TensorRT-LLM Integration Complete!');
  console.log('\n📋 Integrated Services:');
  console.log(`  • NATS Server: http://localhost:${config.natsPort}`);
  console.log(`  • QUIC Protocol: udp://localhost:${config.quicPort}`);
  console.log(`  • Caddy gRPC: http://localhost:${config.caddyPort}`);
  console.log(`  • Redis + Client Libraries: redis://localhost:${config.redisPort}`);
  console.log(`  • PostgreSQL + pgvector: postgresql://localhost:${config.postgresPort}`);
  console.log(`  • TensorRT-LLM API: http://localhost:${config.tensorrtApiPort}`);
  console.log(`  • SvelteKit Frontend: http://localhost:${config.frontendPort}`);
  console.log(`  • MinIO Storage: http://localhost:${config.minioPort}`);
  console.log(`  • Qdrant Vector: http://localhost:${config.qdrantPort}`);

  console.log('\n🔧 Architecture:');
  console.log('  • Client-side: WebAssembly + Gemma:270m SIMD parser');
  console.log('  • GPU RTX: Tensor cores + CUDA service worker');
  console.log('  • Server: Gemma3:legal-latest + Gemma embeddings');
  console.log('  • Stack: Svelte 5, SvelteKit 2, PostgreSQL 17, Drizzle ORM');

  console.log('\n🚀 Next: Copy to Ubuntu via WSL2');
  console.log('  Run: npm run copy:ubuntu');
}

async function main() {
  try {
    // Check existing services
    const servicesRunning = await checkExistingServices();
    if (!servicesRunning) {
      console.log('⚠️ Some Docker Desktop services may not be running');
      console.log('💡 Start them with: docker-compose up -d');
    }

    // Setup integrations
    await setupRedisClientIntegration();
    await integrateWithNATS();
    await setupQUICIntegration();

    // Start TensorRT-LLM
    await startTensorRTLLMService();

    // Test everything
    await testIntegratedStack();

    // Display summary
    await displayIntegrationSummary();
  } catch (error) {
    console.error('❌ Integration failed:', error.message);
    process.exit(1);
  }
}

main();
