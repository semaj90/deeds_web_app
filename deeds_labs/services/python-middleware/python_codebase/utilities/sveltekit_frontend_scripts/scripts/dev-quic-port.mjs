#!/usr/bin/env zx

// Dynamic QUIC Development Server
// Starts SvelteKit with QUIC support on specified port

import { $, argv, echo } from 'zx';

const port = process.env.PORT || argv.port || 5173;
const hmrPort = parseInt(port) + 1000;
const wsPort = parseInt(port) + 2000;

echo`🚀 Starting QUIC Development Server`;
echo`═══════════════════════════════════════`;
echo`🌐 SvelteKit Port: ${port}`;
echo`🔥 HMR WebSocket: ${hmrPort}`;
echo`🔌 Custom WebSocket: ${wsPort}`;
echo`🐳 Docker Network: legal-ai-network`;
echo``;

// Set environment variables for the development server
process.env.PORT = port;
process.env.VITE_HMR_PORT = hmrPort;
process.env.VITE_WS_PORT = wsPort;
process.env.DATABASE_URL = 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
process.env.REDIS_URL = 'redis://:redis@localhost:6379/0';
process.env.REDIS_PASSWORD = 'redis';
process.env.OLLAMA_URL = 'http://localhost:11434';

// QUIC-specific optimizations
process.env.NODE_OPTIONS = '--max-old-space-size=3072';
process.env.ENABLE_GPU = 'true';
process.env.RTX_3060_OPTIMIZATION = 'true';
process.env.CONTEXT7_MULTICORE = 'true';
process.env.OLLAMA_GPU_LAYERS = '30';

echo`🔧 Environment configured:`;
echo`   DATABASE_URL: ${process.env.DATABASE_URL}`;
echo`   REDIS_URL: ${process.env.REDIS_URL}`;
echo`   OLLAMA_URL: ${process.env.OLLAMA_URL}`;
echo``;

// Start the development server
try {
  echo`🚀 Starting Vite development server...`;
  await $`vite dev --port ${port} --host 0.0.0.0 --strictPort false`;
} catch (error) {
  echo`❌ Failed to start development server: ${error.message}`;
  process.exit(1);
}
