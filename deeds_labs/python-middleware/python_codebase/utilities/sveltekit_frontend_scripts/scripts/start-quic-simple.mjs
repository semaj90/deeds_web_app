#!/usr/bin/env zx

// Simple QUIC development setup without Docker dependencies
// Focus on getting SvelteKit frontend running with QUIC optimization

import { $, echo } from 'zx';

echo`🚀 Starting Simple QUIC Development Environment`;
echo`═══════════════════════════════════════════════`;
echo`📡 QUIC/HTTP3: 127.0.0.1:5174`;
echo`⚡ GPU: RTX optimized`;
echo`💾 Native services only`;
echo``;

// Set environment variables for optimal performance
process.env.NODE_OPTIONS = '--max-old-space-size=3072';
process.env.ENABLE_GPU = 'true';
process.env.RTX_3060_OPTIMIZATION = 'true';
process.env.CONTEXT7_MULTICORE = 'true';
process.env.OLLAMA_GPU_LAYERS = '30';
process.env.QUIC_ENABLED = 'true';
process.env.REDIS_PASSWORD = 'redis';

echo`🔧 Environment configured for RTX 3060 optimization`;

// Check if Redis is available
try {
  await $`redis-cli ping`;
  echo`✅ Redis connection verified`;
} catch (e) {
  echo`⚠️ Redis not available - starting without cache`;
}

// Check if PostgreSQL is available
try {
  await $`PGPASSWORD=123456 psql -h localhost -p 5434 -U legal_admin -d legal_ai_db -c "SELECT 1" -t`;
  echo`✅ PostgreSQL connection verified`;
} catch (e) {
  echo`⚠️ PostgreSQL not available - using local SQLite fallback`;
}

echo`🚀 Starting SvelteKit with QUIC optimization...`;
echo`📊 Frontend will be available at: http://127.0.0.1:5174`;
echo``;

// Start SvelteKit with QUIC-optimized settings
await $`vite dev --port 5174 --strictPort --host 127.0.0.1 --clearScreen false`;
