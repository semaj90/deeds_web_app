import express from 'express';
import { checkPostgresConnection } from '../lib/postgres.js';
import { checkRedisConnection } from '../lib/redis.js';
import { checkRabbitMQConnection } from '../lib/rabbitmq.js';
import { checkMinIOConnection } from '../lib/minio.js';
import { checkQdrantConnection } from '../lib/qdrant.js';
import { checkMCPConnection } from '../lib/mcp.js';

const router = express.Router();

// Health check endpoint
router.get('/', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      postgres: false,
      redis: false,
      rabbitmq: false,
      minio: false,
      qdrant: false,
      mcp: false
    },
    uptime: process.uptime()
  };

  try {
    // Check all services in parallel
    const checks = await Promise.allSettled([
      checkPostgresConnection(),
      checkRedisConnection(),
      checkRabbitMQConnection(),
      checkMinIOConnection(),
      checkQdrantConnection(),
      checkMCPConnection()
    ]);

    health.services.postgres = checks[0].status === 'fulfilled' && checks[0].value;
    health.services.redis = checks[1].status === 'fulfilled' && checks[1].value;
    health.services.rabbitmq = checks[2].status === 'fulfilled' && checks[2].value;
    health.services.minio = checks[3].status === 'fulfilled' && checks[3].value;
    health.services.qdrant = checks[4].status === 'fulfilled' && checks[4].value;
    health.services.mcp = checks[5].status === 'fulfilled' && checks[5].value;

    // Determine overall health
    const allHealthy = Object.values(health.services).every(service => service);
    health.status = allHealthy ? 'healthy' : 'degraded';

    const statusCode = allHealthy ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('Health check failed:', error);
    health.status = 'unhealthy';
    res.status(503).json(health);
  }
});

// Detailed health check
router.get('/detailed', async (req, res) => {
  const detailedHealth = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {} as Record<string, any>,
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
      platform: process.platform
    }
  };

  try {
    // Check all services with detailed info
    const checks = await Promise.allSettled([
      checkPostgresConnection().then(result => ({ name: 'postgres', status: result, error: null })).catch(error => ({ name: 'postgres', status: false, error: (error as Error).message })),
      checkRedisConnection().then((result: boolean) => ({ name: 'redis', status: result, error: null })).catch((error: unknown) => ({ name: 'redis', status: false, error: (error as Error).message })),
      checkRabbitMQConnection().then(result => ({ name: 'rabbitmq', status: result, error: null })).catch(error => ({ name: 'rabbitmq', status: false, error: (error as Error).message })),
      checkMinIOConnection().then(result => ({ name: 'minio', status: result, error: null })).catch(error => ({ name: 'minio', status: false, error: (error as Error).message })),
      checkQdrantConnection().then(result => ({ name: 'qdrant', status: result, error: null })).catch(error => ({ name: 'qdrant', status: false, error: (error as Error).message })),
      checkMCPConnection().then(result => ({ name: 'mcp', status: result, error: null })).catch(error => ({ name: 'mcp', status: false, error: (error as Error).message }))
    ]);

    checks.forEach(check => {
      if (check.status === 'fulfilled') {
        detailedHealth.services[check.value.name] = {
          healthy: check.value.status,
          error: check.value.error,
          responseTime: Date.now()
        };
      } else {
        detailedHealth.services[(check.reason as any).name] = {
          healthy: false,
          error: (check.reason as Error).message,
          responseTime: Date.now()
        };
      }
    });

    // Determine overall health
    const allHealthy = Object.values(detailedHealth.services).every((service: any) => service.healthy);
    detailedHealth.status = allHealthy ? 'healthy' : 'degraded';

    const statusCode = allHealthy ? 200 : 503;
    res.status(statusCode).json(detailedHealth);
  } catch (error) {
    console.error('Detailed health check failed:', error);
    detailedHealth.status = 'unhealthy';
    res.status(503).json(detailedHealth);
  }
});

export { router as healthRouter };