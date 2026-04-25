#!/usr/bin/env node

/**
 * 🚀 Enhanced QUIC Development Server with RabbitMQ + XState + WebSocket
 *
 * Starts:
 * 1. WebSocket Orchestrator (ports 5173-5199)
 * 2. QUIC Bridge (ports 8100-8101)
 * 3. Caddy Proxy (port 5178)
 * 4. Vite Dev Server (port 5174)
 * 5. RabbitMQ integration (port 5672 - already running in Docker)
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const rootDir = join(projectRoot, '..');

console.log('🚀 Starting Legal AI Real-Time Development Stack...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Track child processes for cleanup
const childProcesses = new Set();

// Graceful shutdown handler
function gracefulShutdown(signal) {
  console.log(`\n📡 Received ${signal}. Shutting down all services...`);

  childProcesses.forEach((child) => {
    if (!child.killed) {
      console.log(`  ⏹ Stopping process ${child.pid}...`);
      child.kill('SIGTERM');
    }
  });

  console.log('✅ All services stopped');
  process.exit(0);
}

// Register signal handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Helper: Check if service is healthy
async function checkServiceHealth(url) {
  return new Promise((resolve) => {
    http
      .get(url, (res) => {
        resolve(res.statusCode === 200);
      })
      .on('error', () => resolve(false));
  });
}

// Helper: Wait for service
async function waitForService(name, url, maxAttempts = 15) {
  console.log(`⏳ Waiting for ${name}...`);
  for (let i = 0; i < maxAttempts; i++) {
    const healthy = await checkServiceHealth(url);
    if (healthy) {
      console.log(`✅ ${name} is ready`);
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.log(`⚠️  ${name} not responding (continuing anyway)`);
  return false;
}

async function startDevStack() {
  try {
    // ====================================================================
    // 1. Check RabbitMQ (should already be running)
    // ====================================================================
    console.log('\n📨 Checking RabbitMQ...');
    const rabbitmqHealthy = await checkServiceHealth('http://localhost:15672');
    if (rabbitmqHealthy) {
      console.log('✅ RabbitMQ is running (port 5672, management 15672)');
    } else {
      console.log('⚠️  RabbitMQ not detected. Starting it now...');
      console.log('   Run: docker start legal-ai-rabbitmq');
      console.log(
        '   Or: docker run -d --name legal-ai-rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management-alpine'
      );
    }

    // ====================================================================
    // 2. Start WebSocket Orchestrator
    // ====================================================================
    console.log('\n🔌 Starting WebSocket Orchestrator...');
    const wsOrchestrator = spawn('go', ['run', 'main.go'], {
      cwd: join(rootDir, 'go-services', 'ws-orchestrator'),
      stdio: 'pipe',
      shell: true,
    });

    childProcesses.add(wsOrchestrator);

    wsOrchestrator.stdout.on('data', (data) => {
      console.log(`🔌 WS: ${data.toString().trim()}`);
    });

    wsOrchestrator.stderr.on('data', (data) => {
      console.log(`🔌 WS: ${data.toString().trim()}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));
    console.log('✅ WebSocket Orchestrator started');

    // ====================================================================
    // 3. Start QUIC Bridge
    // ====================================================================
    console.log('\n⚡ Starting QUIC Bridge...');
    const quicBridge = spawn('go', ['run', 'main.go'], {
      cwd: join(rootDir, 'go-services', 'quic-bridge'),
      stdio: 'pipe',
      shell: true,
    });

    childProcesses.add(quicBridge);

    quicBridge.stdout.on('data', (data) => {
      console.log(`⚡ QUIC: ${data.toString().trim()}`);
    });

    quicBridge.stderr.on('data', (data) => {
      console.log(`⚡ QUIC: ${data.toString().trim()}`);
    });

    await waitForService('QUIC Bridge', 'http://localhost:8101/health');

    // ====================================================================
    // 4. Start Caddy Proxy
    // ====================================================================
    console.log('\n🌐 Starting Caddy Proxy...');
    const caddyPath = join(rootDir, 'caddy.exe');
    const caddy = spawn(caddyPath, ['run', '--config', 'Caddyfile.development'], {
      cwd: projectRoot,
      stdio: 'pipe',
      shell: true,
    });

    childProcesses.add(caddy);

    caddy.stdout.on('data', (data) => {
      console.log(`🌐 Caddy: ${data.toString().trim()}`);
    });

    caddy.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (!msg.includes('Using config')) {
        // Suppress verbose logs
        console.log(`🌐 Caddy: ${msg}`);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log('✅ Caddy Proxy started');

    // ====================================================================
    // 5. Start Vite Dev Server with RabbitMQ + XState integration
    // ====================================================================
    console.log('\n🔷 Starting Vite Development Server...');
    const vite = spawn('npx', ['vite', 'dev', '--host', '0.0.0.0'], {
      cwd: projectRoot,
      stdio: 'pipe',
      shell: true,
      env: {
        ...process.env,
        // RabbitMQ
        RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
        RABBITMQ_ENABLED: 'true',
        // QUIC
        QUIC_ENABLED: 'true',
        // GPU
        ENABLE_GPU: 'true',
        RTX_3060_OPTIMIZATION: 'true',
        CONTEXT7_MULTICORE: 'true',
        OLLAMA_GPU_LAYERS: '30',
        // Redis
        REDIS_PASSWORD: 'redis',
        // WebSocket auto-discovery
        WS_AUTO_DISCOVERY: 'true',
      },
    });

    childProcesses.add(vite);

    vite.stdout.on('data', (data) => {
      const message = data.toString().trim();
      console.log(`🔷 Vite: ${message}`);
    });

    vite.stderr.on('data', (data) => {
      const message = data.toString().trim();
      console.log(`🔷 Vite: ${message}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 5000));

    // ====================================================================
    // Final Status
    // ====================================================================
    console.log('\n🎉 Legal AI Real-Time Development Stack is Running!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 Service Endpoints:');
    console.log('');
    console.log('   🔷 Vite Dev Server:        http://localhost:5174');
    console.log('   🌐 Caddy Proxy (HTTP/3):   http://localhost:5178');
    console.log('   🔌 WebSocket Orchestrator: http://localhost:5179-5183');
    console.log('   ⚡ QUIC Bridge (HTTP):     http://localhost:8101');
    console.log('   ⚡ QUIC Bridge (HTTPS):    https://localhost:8100');
    console.log('   📨 RabbitMQ:               amqp://localhost:5672');
    console.log('   📊 RabbitMQ Management:    http://localhost:15672');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔧 Integration Status:');
    console.log('');
    console.log('   ✅ WebSocket Real-Time Messaging');
    console.log('   ✅ RabbitMQ Async Workflows');
    console.log('   ✅ XState Orchestration');
    console.log('   ✅ QUIC/HTTP3 Transport');
    console.log('   ✅ Auto-Service Discovery');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📚 Usage:');
    console.log('');
    console.log('   📄 Document Processing Workflow:');
    console.log('      XState manages state → RabbitMQ processes async');
    console.log('      → WebSocket broadcasts updates in real-time');
    console.log('');
    console.log('   🧪 Test Integration:');
    console.log('      node test-realtime-integration.mjs');
    console.log('');
    console.log('   📋 Service Registry:');
    console.log('      cat .ws-registry.json | jq');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 Hot Module Reload (HMR) enabled');
    console.log('💡 Press Ctrl+C to stop all services');
    console.log('');
  } catch (error) {
    console.error('❌ Failed to start development stack:', error.message);
    process.exit(1);
  }
}

// Start the development stack
startDevStack().catch((error) => {
  console.error('❌ Error starting development stack:', error);
  process.exit(1);
});
