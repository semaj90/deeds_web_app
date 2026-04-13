#!/usr/bin/env node
/**
 * Dev Server Readiness Check
 *
 * Verifies all backend services are ready before starting npm run dev
 * Usage: node scripts/dev-readiness-check.mjs && npm run dev
 */

import net from 'net';

const SERVICES = [
  { name: 'PostgreSQL (Prod DB)', host: '127.0.0.1', port: 5434 },
  { name: 'Redis', host: '127.0.0.1', port: 6379 },
  { name: 'RabbitMQ', host: '127.0.0.1', port: 5672 },
  { name: 'Qdrant', host: '127.0.0.1', port: 6333 },
  { name: 'Bifrost (optional)', host: '127.0.0.1', port: 3040, optional: true },
];

async function checkPort(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeout);

    socket.on('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function main() {
  console.log('🔍 Checking backend service readiness...\n');

  let allReady = true;
  let optionalCount = 0;

  for (const service of SERVICES) {
    const ready = await checkPort(service.host, service.port);

    if (ready) {
      console.log(`✅ ${service.name} (${service.host}:${service.port})`);
    } else if (service.optional) {
      console.log(`⚠️  ${service.name} (${service.host}:${service.port}) - OPTIONAL, skipping`);
      optionalCount++;
    } else {
      console.log(`❌ ${service.name} (${service.host}:${service.port}) - NOT READY`);
      allReady = false;
    }
  }

  console.log();

  if (!allReady) {
    console.error('🛑 Required services are not ready. Start them first:');
    console.error('   docker start deeds-postgres-prod deeds-postgres-prod-proxy deeds-redis-prod phase66-rabbitmq phase66-qdrant');
    console.error('\nThen re-run: node scripts/dev-readiness-check.mjs\n');
    process.exit(1);
  }

  if (optionalCount > 0) {
    console.log(`⚠️  ${optionalCount} optional service(s) unavailable (non-fatal)\n`);
  }

  console.log('✅ All required services ready! Safe to run: npm run dev\n');
  process.exit(0);
}

main();
