#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Starting Legal AI QUIC Development Server...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Start Caddy first
console.log('🌐 Starting Caddy QUIC proxy...');
const caddy = spawn('npm', ['run', 'caddy:start'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true,
});

caddy.on('close', (code) => {
  if (code === 0) {
    console.log('✅ Caddy started successfully');
    console.log('🌐 QUIC: http://localhost:5178/agent-demo');

    // Start Vite dev server
    console.log('🔷 Starting Vite development server...');
    const vite = spawn('npx', ['vite', 'dev', '--host', '0.0.0.0'], {
      cwd: __dirname,
      stdio: 'inherit',
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

    vite.on('close', (code) => {
      console.log(`Vite exited with code ${code}`);
    });

    // Handle cleanup
    process.on('SIGINT', () => {
      console.log('\n📡 Shutting down development server...');
      vite.kill('SIGTERM');
      process.exit(0);
    });
  } else {
    console.error('❌ Failed to start Caddy');
    process.exit(1);
  }
});
