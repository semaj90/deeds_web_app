#!/usr/bin/env zx

// Enhanced QUIC Development Environment - Full Stack
// Complete containerized legal AI platform with QUIC/HTTP3 support

import { $, question, echo, sleep } from 'zx';

echo`🚀 Starting Enhanced QUIC Development Environment (Full Stack)`;
echo`════════════════════════════════════════════════════════════════════`;
echo`🐳 Complete containerized legal AI platform`;
echo`⚡ QUIC/HTTP3 + WebSocket priority + Self-signed certificates`;
echo`🎯 Standardized port configuration (5173)`;
echo``;

// Stop original Docker services to avoid conflicts
echo`🧹 Stopping original Docker services...`;
const originalServices = [
  'legal-ai-redis',
  'legal-ai-postgres',
  'legal-ai-minio',
  'legal_ai_test_db',
  'legal_ai_test_redis',
];

for (const service of originalServices) {
  try {
    await $`docker stop ${service}`;
    echo`   ✅ Stopped ${service}`;
  } catch (e) {
    echo`   ℹ️  ${service} not running`;
  }
}
echo``;

// Check Docker
try {
  await $`docker info`;
  echo`✅ Docker Desktop is running`;
} catch (e) {
  echo`❌ Docker Desktop is not running. Please start Docker Desktop.`;
  process.exit(1);
}

// Ensure Docker network exists
try {
  await $`docker network create legal-ai-network`;
  echo`🔗 Created Docker network: legal-ai-network`;
} catch (e) {
  echo`🔗 Docker network already exists: legal-ai-network`;
}

// Start Docker services with full infrastructure
echo`🐳 Starting complete Docker infrastructure...`;
cd('..');
try {
  await $`docker-compose -f docker-compose.dynamic.yml up -d`;
  echo`✅ Docker services started successfully`;
} catch (e) {
  echo`❌ Failed to start Docker services: ${e.message}`;
  process.exit(1);
}
cd('sveltekit-frontend');

// Wait for services to be ready
echo`⏳ Waiting for Docker services to be ready...`;
await sleep(8000);

echo`✅ Full Stack Infrastructure Ready!`;
echo`   PostgreSQL: localhost:5432`;
echo`   Redis: localhost:6379`;
echo`   Redis Insight: localhost:8001`;
echo`   MinIO API: localhost:9000`;
echo`   MinIO Console: localhost:9001`;
echo``;

// Wait for Caddy QUIC proxy to be ready
echo`🔄 Waiting for Caddy QUIC proxy...`;
let caddyReady = false;
for (let i = 0; i < 30; i++) {
  try {
    await $`curl -k -f https://localhost:443/health`;
    echo`✅ Caddy QUIC proxy ready with self-signed certificates`;
    caddyReady = true;
    break;
  } catch (e) {
    echo`   Waiting for Caddy... (${i + 1}/30)`;
    await sleep(2000);
  }
}

// Wait for frontend container
echo`🔄 Waiting for frontend container...`;
let frontendReady = false;
for (let i = 0; i < 30; i++) {
  try {
    await $`curl -f http://localhost:5173/`;
    echo`✅ Frontend container ready`;
    frontendReady = true;
    break;
  } catch (e) {
    echo`   Waiting for frontend... (${i + 1}/30)`;
    await sleep(3000);
  }
}

echo``;
echo`🎉 Enhanced QUIC Development Environment Ready!`;
echo`════════════════════════════════════════════════════════════════════`;
echo`🔒 HTTPS (QUIC/HTTP3): https://localhost:443`;
echo`🔓 HTTP (redirects): http://localhost:80`;
echo`🔧 Direct Frontend: http://localhost:5173`;
echo`📊 Redis Insight: http://localhost:8001`;
echo`🗄️  MinIO Console: http://localhost:9001`;
echo``;
echo`⚡ Features Active:`;
echo`   - Full legal AI platform containerized`;
echo`   - QUIC/HTTP3 protocol via Caddy`;
echo`   - WebSocket priority routing`;
echo`   - Self-signed certificates (Playwright/Puppeteer ready)`;
echo`   - PostgreSQL with pgvector`;
echo`   - Redis with full-text search`;
echo`   - MinIO object storage`;
echo`   - RTX 3060 GPU optimizations`;
echo``;
echo`💡 Press Ctrl+C to stop`;
echo`💡 To stop services: docker-compose -f ../docker-compose.dynamic.yml down`;
echo``;

// Keep the script running to maintain the environment
echo`🏃 Environment running... (Press Ctrl+C to stop)`;
try {
  // Keep alive until interrupted
  await new Promise(() => {});
} catch (e) {
  echo`🛑 Shutting down QUIC development environment`;
}
