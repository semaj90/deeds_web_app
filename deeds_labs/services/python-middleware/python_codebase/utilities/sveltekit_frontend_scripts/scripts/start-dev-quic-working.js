#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🚀 Starting Legal AI QUIC Development Server...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Track child processes for cleanup
const childProcesses = new Set();

// Graceful shutdown handler
function gracefulShutdown(signal) {
  console.log(`\n📡 Received ${signal}. Shutting down development server...`);

  // Stop all child processes
  childProcesses.forEach((child) => {
    if (!child.killed) {
      console.log(`  ⏹ Stopping process ${child.pid}...`);
      child.kill('SIGTERM');
    }
  });

  console.log('✅ Development server stopped');
  process.exit(0);
}

// Register signal handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

async function startDevQuic() {
  try {
    console.log('🌐 Starting Caddy QUIC proxy...');

    const caddy = spawn('npm', ['run', 'caddy:start'], {
      cwd: projectRoot,
      stdio: 'pipe',
      shell: true,
    });

    childProcesses.add(caddy);

    // Log Caddy output
    caddy.stdout.on('data', (data) => {
      console.log(`🌐 Caddy: ${data.toString().trim()}`);
    });

    caddy.stderr.on('data', (data) => {
      console.log(`🌐 Caddy: ${data.toString().trim()}`);
    });

    // Wait for Caddy to start
    await new Promise((resolve) => setTimeout(resolve, 3000));

    console.log('✅ Caddy started successfully');
    console.log('🌐 QUIC: http://localhost:5178/agent-demo');

    console.log('🔷 Starting Vite development server...');

    const vite = spawn('npx', ['vite', 'dev', '--host', '0.0.0.0'], {
      cwd: projectRoot,
      stdio: 'pipe',
      shell: true,
      env: {
        ...process.env,
        REDIS_PASSWORD: 'redis',
        QUIC_ENABLED: 'true',
        ENABLE_GPU: 'true',
        RTX_3060_OPTIMIZATION: 'true',
        CONTEXT7_MULTICORE: 'true',
        OLLAMA_GPU_LAYERS: '30',
      },
    });

    childProcesses.add(vite);

    // Log Vite output
    vite.stdout.on('data', (data) => {
      const message = data.toString().trim();
      console.log(`🔷 Vite: ${message}`);
    });

    vite.stderr.on('data', (data) => {
      const message = data.toString().trim();
      console.log(`🔷 Vite: ${message}`);
    });

    // Wait for Vite to initialize
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Show status and access points
    console.log('\n🎉 Legal AI QUIC Development Server is running!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 Access Points:');
    console.log('   🔷 SvelteKit Frontend:        http://localhost:5173');
    console.log('   🌐 QUIC Proxy:               http://localhost:5178/agent-demo');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 Ready for development with hot reload');
    console.log('💡 Press Ctrl+C to stop all services');
    console.log('');
  } catch (error) {
    console.error('❌ Failed to start development server:', error.message);
    process.exit(1);
  }
}

// Start the development server
startDevQuic().catch((error) => {
  console.error('❌ Error starting development server:', error);
  process.exit(1);
});
