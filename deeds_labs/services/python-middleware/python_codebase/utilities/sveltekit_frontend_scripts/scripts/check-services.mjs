#!/usr/bin/env node

/**
 * 🔍 Pre-flight Check for npm run dev:quic
 *
 * Verifies all services are ready before starting the full stack
 */

import http from 'http';
import net from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const services = [
  { name: 'PostgreSQL', url: 'localhost', port: 5434, method: 'TCP' },
  { name: 'Redis', url: 'localhost', port: 6379, method: 'TCP' },
  { name: 'Ollama', url: 'http://localhost:11434', port: 11434, method: 'HTTP' },
  { name: 'MinIO API', url: 'http://localhost:9000', port: 9000, method: 'HTTP' },
  { name: 'RabbitMQ AMQP', url: 'localhost', port: 5672, method: 'TCP' },
];

async function checkPort(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, host);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      resolve(false);
    });
    setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 1000);
  });
}

async function checkHTTP(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      resolve(res.statusCode < 500);
    }).on('error', () => {
      resolve(false);
    });
  });
}

async function main() {
  console.log('🔍 Pre-flight Check for npm run dev:quic\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let allReady = true;

  for (const service of services) {
    let ready = false;

    if (service.method === 'TCP') {
      ready = await checkPort(service.url, service.port);
    } else if (service.method === 'HTTP') {
      ready = await checkHTTP(service.url);
    }

    const status = ready ? '✅' : '❌';
    console.log(`${status} ${service.name.padEnd(15)} (${service.url}:${service.port})`);

    if (!ready && service.name !== 'RabbitMQ AMQP' && service.name !== 'MinIO API') {
      allReady = false;
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (allReady) {
    console.log('✨ All critical services are ready!\n');
    console.log('🚀 Ready to run: npm run dev:quic\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some services are not ready.\n');
    console.log('💡 Start Docker Desktop and services, then try again.\n');
    process.exit(1);
  }
}

main();
