/**
 * 🏥 Service Health Check API Endpoint
 *
 * GET /api/health/services
 *
 * Returns health status of all external services:
 * - PostgreSQL + pgvector
 * - Redis
 * - Qdrant
 * - Ollama (embedding & chat models)
 * - Neo4j
 * - MinIO
 * - RabbitMQ
 *
 * Used by monitoring dashboards and `npm run dev:quic`
 */
import { getServiceAdapters, healthCheckServices } from '$lib/server/adapters/service-integrations';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { ENV } from '$lib/server/env.server.js';

export const GET: RequestHandler = async ({ locals }) => {
 if (!locals.user) return json({ status: 'degraded', error: 'Unauthorized' }, { status: 401 });
 const startTime = Date.now();
 try {
 const services = getServiceAdapters();
 const serviceUrls = services.env;

 // Perform comprehensive health checks
 const healthStatus = await healthCheckServices();

 // Additional service checks
 const detailedStatus = {
 ...healthStatus,
 services: {
 ...healthStatus.services,
        // Add additional checks
        qdrant: await checkQdrant(services.qdrant),
        minio: await checkMinIO(services.minio),
        rabbitmq: await checkRabbitMQ(services.rabbitmq),
      },
      urls: serviceUrls,
      responseTimeMs: Date.now() - startTime,
      environment: ENV.NODE_ENV,
    };

    // Overall health status
    const allHealthy = Object.values(detailedStatus.services).every((status) => status === true);

    return json(
      {
        status: allHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        ...detailedStatus,
      },
      {
        status: allHealthy ? 200 : 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Health-Check': 'true',
        },
      }
    );
  } catch (error: unknown) {
    console.error('Health check failed: ', error);
    return json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
        responseTimeMs: Date.now() - startTime,
      },
      { status: 503 }
    );
  }
};

/**
 * Check Qdrant connectivity — adapter signature is search(collection, vector, limit?).
 * Use the existing legal_documents collection (768-dim) which is always present.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkQdrant(qdrant: any): Promise<boolean> {
  try {
    await qdrant.search('legal_documents', new Array(768).fill(0), 1);
    return true;
  } catch (error) {
    console.warn('Qdrant health check failed: ', error);
    return false;
  }
}

/**
 * Check MinIO connectivity
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkMinIO(minio: any): Promise<boolean> {
  try {
    await minio.bucketExists?.('legal-evidence');
    return true;
  } catch (error) {
    console.warn('MinIO health check failed: ', error);
    return false;
  }
}

/**
 * Check RabbitMQ connectivity — probe the management API.
 * The adapter is a config-only object (no live connection); previously this
 * returned `true` unconditionally inside a no-op try/catch. Now it does an
 * actual HTTP probe against the management UI port.
 */
async function checkRabbitMQ(rabbitmq: { url: string; enabled: boolean }): Promise<boolean> {
  if (!rabbitmq.enabled) return false;
  try {
    const mgmtUrl = rabbitmq.url
      .replace('amqp://', 'http://')
      .replace(':5672', ':15672');
    // Anonymous probe — management API responds 401 without creds, which still
    // proves the broker is up. Treat 200 OR 401 as "alive".
    const res = await fetch(mgmtUrl, { signal: AbortSignal.timeout(2_000) });
    return res.status === 200 || res.status === 401;
  } catch (error) {
    console.warn('RabbitMQ health check failed: ', error);
    return false;
  }
}


