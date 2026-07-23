#!/usr/bin/env node

/**
 * Test Qdrant connectivity
 * Verifies REST transport (primary) and gRPC transport (optional)
 * Part of P1 Implementation Task 1: Fix Qdrant Transport
 */

import https from 'https';
import http from 'http';

const env = process.env;

// Environment variables from .env
const QDRANT_URL = env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_TRANSPORT = env.QDRANT_TRANSPORT || 'rest';
const QDRANT_USE_GRPC = env.QDRANT_USE_GRPC === 'true';
const QDRANT_GRPC_HOST = env.QDRANT_GRPC_HOST || '127.0.0.1';
const QDRANT_GRPC_PORT = parseInt(env.QDRANT_GRPC_PORT || '6334', 10);

const log = {
  info: (msg) => console.log(`[qdrant-connectivity] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
};

log.info('Testing Qdrant connectivity...\n');

/**
 * Test REST transport
 */
async function testRestTransport() {
  return new Promise((resolve) => {
    const url = new URL('/collections', QDRANT_URL);
    const client = QDRANT_URL.startsWith('https') ? https : http;

    const request = client.get(url, { timeout: 3000 }, (response) => {
      let data = '';
      response.on('data', (chunk) => (data += chunk));
      response.on('end', () => {
        if (response.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            log.ok(`REST transport: ${QDRANT_URL} OK`);
            const collections = parsed.result?.collections?.length || 0;
            log.info(`  Collections found: ${collections}`);
            resolve(true);
          } catch {
            log.warn(
              `REST transport: ${QDRANT_URL} responded but JSON parse failed`
            );
            resolve(false);
          }
        } else {
          log.warn(
            `REST transport: ${QDRANT_URL} returned HTTP ${response.statusCode}`
          );
          resolve(false);
        }
      });
    });

    request.on('error', (err) => {
      log.warn(
        `REST transport: ${QDRANT_URL} connection failed (${err.code})`
      );
      resolve(false);
    });

    request.on('timeout', () => {
      request.destroy();
      log.warn(`REST transport: ${QDRANT_URL} timeout`);
      resolve(false);
    });
  });
}

/**
 * Test gRPC transport (TCP connection only)
 */
async function testGrpcTransport() {
  const net = await import('net');
  return new Promise((resolve) => {
    const socket = net.default.createConnection(
      { host: QDRANT_GRPC_HOST, port: QDRANT_GRPC_PORT, timeout: 3000 },
      () => {
        socket.destroy();
        log.ok(`gRPC transport: ${QDRANT_GRPC_HOST}:${QDRANT_GRPC_PORT} OK`);
        resolve(true);
      }
    );

    socket.on('error', (err) => {
      log.warn(
        `gRPC transport: ${QDRANT_GRPC_HOST}:${QDRANT_GRPC_PORT} connection failed (${err.code})`
      );
      resolve(false);
    });

    socket.on('timeout', () => {
      socket.destroy();
      log.warn(
        `gRPC transport: ${QDRANT_GRPC_HOST}:${QDRANT_GRPC_PORT} timeout`
      );
      resolve(false);
    });
  });
}

/**
 * Main test routine
 */
async function main() {
  log.info(`Configuration:`);
  log.info(`  QDRANT_TRANSPORT=${QDRANT_TRANSPORT}`);
  log.info(`  QDRANT_URL=${QDRANT_URL}`);
  log.info(`  QDRANT_USE_GRPC=${QDRANT_USE_GRPC}`);
  log.info(`  QDRANT_GRPC_HOST=${QDRANT_GRPC_HOST}:${QDRANT_GRPC_PORT}\n`);

  const restOk = await testRestTransport();
  log.info('');

  const grpcOk = await testGrpcTransport();
  log.info('');

  log.info('Summary:');
  log.info(`  Primary (REST): ${restOk ? '✅ Ready' : '❌ Failed'}`);
  log.info(`  Optional (gRPC): ${grpcOk ? '✅ Ready' : '⚠️  Optional'}`);
  log.info('');

  if (!restOk) {
    log.error(
      'REST transport is not responding. Check QDRANT_URL and ensure Qdrant is running.'
    );
    process.exit(1);
  }

  log.ok('Qdrant connectivity test passed!');
  log.info('Next step: Run "npm run atlas:clustering:health" to freeze baseline');
  process.exit(0);
}

main().catch((err) => {
  log.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
