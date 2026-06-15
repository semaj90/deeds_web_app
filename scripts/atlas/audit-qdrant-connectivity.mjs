#!/usr/bin/env node
/**
 * Audit Qdrant Connectivity
 *
 * Diagnoses REST vs gRPC connectivity and recommends transport mode.
 * Outputs JSON report + markdown summary.
 *
 * Fixes issue: services trying to use Qdrant gRPC on 6334 over IPv6 Docker
 * address when REST on http://127.0.0.1:6333 is available and working.
 *
 * Usage:
 *   node scripts/atlas/audit-qdrant-connectivity.mjs [--apply]
 *
 * Output:
 *   docs/reports/qdrant-connectivity-audit.json
 *   docs/reports/qdrant-connectivity-audit.md
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(ROOT, 'docs', 'reports');

const QDRANT_REST_HOST = process.env.QDRANT_HOST || '127.0.0.1';
const QDRANT_REST_PORT = parseInt(process.env.QDRANT_PORT || '6333', 10);
const QDRANT_GRPC_HOST = process.env.QDRANT_GRPC_HOST || '127.0.0.1';
const QDRANT_GRPC_PORT = parseInt(process.env.QDRANT_GRPC_PORT || '6334', 10);
const QDRANT_URL = process.env.QDRANT_URL || `http://${QDRANT_REST_HOST}:${QDRANT_REST_PORT}`;

const logger = {
  log: (msg) => console.log(msg),
  ok: (msg) => console.log(`✅ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
};

async function checkRestConnectivity() {
  logger.info('Checking REST endpoint connectivity...');

  return new Promise((resolve) => {
    const agent = new http.Agent({ family: 4, timeout: 5000 });
    const options = {
      hostname: QDRANT_REST_HOST,
      port: QDRANT_REST_PORT,
      path: '/collections',
      method: 'GET',
      agent,
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            hasCollections: !!json.result?.collections,
            collectionsCount: json.result?.collections?.length || 0,
          });
        } catch {
          resolve({
            ok: false,
            statusCode: res.statusCode,
            error: 'Failed to parse JSON response',
          });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Connection timeout (5000ms)' });
    });
  });
}

async function checkGrpcConnectivity() {
  logger.info('Checking gRPC endpoint connectivity...');

  return new Promise((resolve) => {
    const socket = createConnection(
      { host: QDRANT_GRPC_HOST, port: QDRANT_GRPC_PORT, family: 4 },
      () => {
        socket.destroy();
        resolve({ ok: true, reachable: true });
      }
    );

    socket.setTimeout(5000);

    socket.on('error', (err) => {
      resolve({ ok: false, error: err.code || err.message });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ok: false, error: 'Connection timeout (5000ms)' });
    });
  });
}

async function checkCollectionDetails() {
  logger.info('Checking collection details...');

  return new Promise((resolve) => {
    const agent = new http.Agent({ family: 4, timeout: 5000 });
    const options = {
      hostname: QDRANT_REST_HOST,
      port: QDRANT_REST_PORT,
      path: '/collections/codebase_chunks_768',
      method: 'GET',
      agent,
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            pointsCount: json.result?.points_count || 0,
            payloadSchemaSize: Object.keys(json.result?.payload_schema || {}).length,
            statusCode: res.statusCode,
          });
        } catch {
          resolve({
            ok: false,
            statusCode: res.statusCode,
            error: 'Failed to parse response',
          });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Timeout' });
    });
  });
}

async function auditQdrantConnectivity() {
  logger.log('\n╔════════════════════════════════════════════════════════════════╗');
  logger.log('║  Audit: Qdrant Connectivity                                   ║');
  logger.log('╚════════════════════════════════════════════════════════════════╝\n');

  const report = {
    timestamp: new Date().toISOString(),
    configuration: {
      restUrl: QDRANT_URL,
      restHost: QDRANT_REST_HOST,
      restPort: QDRANT_REST_PORT,
      grpcHost: QDRANT_GRPC_HOST,
      grpcPort: QDRANT_GRPC_PORT,
      transportPreference: process.env.QDRANT_TRANSPORT || 'auto',
    },
    results: {},
    recommendation: null,
    status: 'UNKNOWN',
  };

  // Check REST
  logger.log('Step 1: REST Connectivity...');
  const restResult = await checkRestConnectivity();
  report.results.rest = restResult;
  logger.info(`  REST ${QDRANT_REST_HOST}:${QDRANT_REST_PORT}: ${restResult.ok ? '✅ WORKS' : '❌ FAIL'}`);
  if (restResult.ok) {
    logger.info(`  Status: ${restResult.statusCode}, Collections: ${restResult.collectionsCount}`);
  } else {
    logger.warn(`  Error: ${restResult.error}`);
  }

  // Check gRPC
  logger.log('\nStep 2: gRPC Connectivity...');
  const grpcResult = await checkGrpcConnectivity();
  report.results.grpc = grpcResult;
  logger.info(`  gRPC ${QDRANT_GRPC_HOST}:${QDRANT_GRPC_PORT}: ${grpcResult.ok ? '✅ WORKS' : '❌ FAIL'}`);
  if (!grpcResult.ok) {
    logger.warn(`  Error: ${grpcResult.error}`);
  }

  // Check collection details
  if (restResult.ok) {
    logger.log('\nStep 3: Collection Details...');
    const collectionResult = await checkCollectionDetails();
    report.results.collection = collectionResult;
    if (collectionResult.ok) {
      logger.ok(`  codebase_chunks_768: ${collectionResult.pointsCount} points, ${collectionResult.payloadSchemaSize} payload fields`);
    } else {
      logger.warn(`  Error: ${collectionResult.error}`);
    }
  }

  // Recommendation
  logger.log('\nStep 4: Recommendation...');

  if (restResult.ok && !grpcResult.ok) {
    report.recommendation = {
      transport: 'REST',
      reason: 'REST endpoint (6333) works, gRPC (6334) is unreachable',
      action: 'Set QDRANT_TRANSPORT=rest in env',
      envVars: {
        QDRANT_URL: QDRANT_URL,
        QDRANT_HOST: QDRANT_REST_HOST,
        QDRANT_PORT: QDRANT_REST_PORT,
        QDRANT_TRANSPORT: 'rest',
        QDRANT_USE_GRPC: 'false',
      },
    };
    report.status = 'PASS';
    logger.ok('Use REST transport (http://127.0.0.1:6333)');
    logger.ok('Set QDRANT_TRANSPORT=rest in .env');
  } else if (restResult.ok && grpcResult.ok) {
    report.recommendation = {
      transport: 'REST (preferred)',
      reason: 'Both transports work; REST is simpler and doesn\'t require gRPC proto',
      action: 'Set QDRANT_TRANSPORT=rest in env',
      envVars: {
        QDRANT_URL: QDRANT_URL,
        QDRANT_TRANSPORT: 'rest',
      },
    };
    report.status = 'PASS';
    logger.ok('Both transports available; prefer REST (simpler)');
  } else if (!restResult.ok && grpcResult.ok) {
    report.recommendation = {
      transport: 'gRPC',
      reason: 'REST endpoint unreachable, but gRPC (6334) works',
      action: 'Set QDRANT_TRANSPORT=grpc in env',
      envVars: {
        QDRANT_GRPC_HOST: QDRANT_GRPC_HOST,
        QDRANT_GRPC_PORT: QDRANT_GRPC_PORT,
        QDRANT_TRANSPORT: 'grpc',
      },
    };
    report.status = 'WARN';
    logger.warn('REST is down; falling back to gRPC');
  } else {
    report.recommendation = {
      transport: 'UNAVAILABLE',
      reason: 'Neither REST nor gRPC endpoints reachable',
      action: 'Check Docker container and port mappings',
      debug: [
        'docker ps --format "table {{.Names}}\\t{{.Ports}}" | findstr qdrant',
        'Test-NetConnection 127.0.0.1 -Port 6333',
        'Test-NetConnection 127.0.0.1 -Port 6334',
      ],
    };
    report.status = 'FAIL';
    logger.error('Qdrant not reachable on either transport!');
  }

  return report;
}

async function main() {
  const report = await auditQdrantConnectivity();

  await fs.mkdir(REPORTS_DIR, { recursive: true });

  // Write JSON report
  await fs.writeFile(
    path.join(REPORTS_DIR, 'qdrant-connectivity-audit.json'),
    JSON.stringify(report, null, 2)
  );

  // Write markdown report
  const md = `# Qdrant Connectivity Audit

**Timestamp**: ${report.timestamp}
**Status**: ${report.status}
**Transport Recommendation**: ${report.recommendation?.transport || 'UNKNOWN'}

## Configuration

- REST: http://${report.configuration.restHost}:${report.configuration.restPort}
- gRPC: ${report.configuration.grpcHost}:${report.configuration.grpcPort}

## Results

### REST (http://127.0.0.1:6333)
${report.results.rest.ok ? '✅ **WORKS**' : '❌ **FAIL**'}
${report.results.rest.ok ? `- Status: ${report.results.rest.statusCode}\\n- Collections: ${report.results.rest.collectionsCount}` : `- Error: ${report.results.rest.error}`}

### gRPC (127.0.0.1:6334)
${report.results.grpc.ok ? '✅ **WORKS**' : '❌ **FAIL**'}
${report.results.grpc.ok ? '- Port is reachable' : `- Error: ${report.results.grpc.error}`}

### Collection Details
${report.results.collection?.ok ? `✅ codebase_chunks_768: ${report.results.collection.pointsCount} points, ${report.results.collection.payloadSchemaSize} payload fields` : '⚠️ Could not fetch details'}

## Recommendation

**Use Transport**: \`${report.recommendation?.transport || 'N/A'}\`

${report.recommendation?.reason ? `**Reason**: ${report.recommendation.reason}` : ''}

${report.recommendation?.action ? `**Action**: ${report.recommendation.action}` : ''}

## Environment Variables

\`\`\`bash
${
  report.recommendation?.envVars
    ? Object.entries(report.recommendation.envVars)
        .map(([k, v]) => `${k}=${v}`)
        .join('\\n')
    : '# Set appropriate variables'
}
\`\`\`

${
  report.recommendation?.debug
    ? `## Debugging

\`\`\`bash
${report.recommendation.debug.join('\\n')}
\`\`\`
`
    : ''
}

`;

  await fs.writeFile(path.join(REPORTS_DIR, 'qdrant-connectivity-audit.md'), md);

  logger.ok(`\n✅ Reports written to ${REPORTS_DIR}`);
  logger.log(`Status: ${report.status}`);
}

main().catch((err) => {
  logger.error(err.message);
  process.exit(1);
});
