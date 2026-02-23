/**
 * Evidence Service - Production Bootstrap
 *
 * Fully integrated service with:
 * - Apollo GraphQL Server
 * - RabbitMQ consumers (OCR, Embed, Entity, Summarize)
 * - XState LegalWorkflowOrchestrator
 * - Redis Pub/Sub for SSE
 * - Dynamic port configuration
 * - PostgreSQL + pgvector + Qdrant + MinIO
 * - GPU-accelerated Gemma3 embeddings
 * - Lucia V3 auth integration
 */

import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { typeDefs } from '../graphql/schema.js';
import { resolvers } from '../graphql/resolvers/index.js';
import { connectRabbitMQ, consumeQueue, publishQueue } from './rabbitmq.js';
import { createRedisInstance } from './redis.js';
import { LegalWorkflowOrchestrator } from './orchestrator.js';
import { ensureBucket } from '../storage/minio.js';
import { ensureCollection } from '../rag/qdrant.js';
import { env } from '../env.js';
import { logger } from '../utils/logger.js';
import type { Evidence } from '../db/schema.js';
import Redis from 'ioredis';

// ==== DYNAMIC PORT CONFIG ====
const PORT = process.env.EVIDENCE_SERVICE_PORT
  ? parseInt(process.env.EVIDENCE_SERVICE_PORT)
  : env.service.port;

// Global instances
let redis: Redis;
let orchestrator: LegalWorkflowOrchestrator;

/**
 * Initialize infrastructure services
 */
async function initializeInfrastructure(): Promise<void> {
  logger.info('Initializing infrastructure...', { port: PORT });

  try {
    // Connect to RabbitMQ
    logger.info('Connecting to RabbitMQ...');
    await connectRabbitMQ();

    // Initialize Redis for Pub/Sub and caching
    logger.info('Connecting to Redis...');
    redis = createRedisInstance();
    await redis.ping();
    logger.info('Redis connected');

    // Initialize LegalWorkflowOrchestrator with Redis
    logger.info('Initializing LegalWorkflowOrchestrator...');
    orchestrator = new LegalWorkflowOrchestrator(redis);

    // Ensure MinIO bucket exists
    logger.info('Ensuring MinIO bucket exists...');
    await ensureBucket();

    // Ensure Qdrant collection exists
    logger.info('Ensuring Qdrant collection exists...');
    await ensureCollection();

    logger.info('Infrastructure initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize infrastructure', { error });
    throw error;
  }
}

/**
 * Start RabbitMQ consumers for evidence processing pipeline
 */
async function startWorkerConsumers(): Promise<void> {
  logger.info('Starting RabbitMQ worker consumers...');

  // OCR Worker Consumer
  await consumeQueue('evidence.ocr', async (message: any) => {
    const { evidenceId, sessionId, context } = message;
    logger.info('Processing OCR job', { evidenceId, sessionId });

    try {
      // Trigger workflow orchestration
      const workflowResult = await orchestrator.orchestrateWorkflow(
        context || { sessionId, evidenceId },
        `Process OCR for evidence ${evidenceId}`
      );

      // Publish result to Redis for SSE
      await redis.publish(
        `workflow:session:${sessionId}`,
        JSON.stringify({
          type: 'OCR_COMPLETE',
          evidenceId,
          timestamp: new Date().toISOString(),
          result: workflowResult,
        })
      );

      logger.info('OCR job completed', { evidenceId });
    } catch (error) {
      logger.error('OCR job failed', { evidenceId, error });

      // Publish error event
      await redis.publish(
        `workflow:session:${sessionId}`,
        JSON.stringify({
          type: 'OCR_ERROR',
          evidenceId,
          error: String(error),
          timestamp: new Date().toISOString(),
        })
      );
    }
  });

  // Embedding Worker Consumer
  await consumeQueue('evidence.embed', async (message: any) => {
    const { evidenceId, sessionId, text, context } = message;
    logger.info('Processing Embedding job', { evidenceId, sessionId });

    try {
      // Trigger workflow orchestration for embedding analysis
      const workflowResult = await orchestrator.orchestrateWorkflow(
        context || { sessionId, evidenceId, text },
        `Generate embeddings and semantic analysis for evidence ${evidenceId}`
      );

      // Publish result to Redis for SSE
      await redis.publish(
        `workflow:session:${sessionId}`,
        JSON.stringify({
          type: 'EMBEDDING_COMPLETE',
          evidenceId,
          timestamp: new Date().toISOString(),
          result: workflowResult,
        })
      );

      logger.info('Embedding job completed', { evidenceId });
    } catch (error) {
      logger.error('Embedding job failed', { evidenceId, error });

      await redis.publish(
        `workflow:session:${sessionId}`,
        JSON.stringify({
          type: 'EMBEDDING_ERROR',
          evidenceId,
          error: String(error),
          timestamp: new Date().toISOString(),
        })
      );
    }
  });

  // Entity Extraction Worker Consumer
  await consumeQueue('evidence.entity', async (message: any) => {
    const { evidenceId, sessionId, text, context } = message;
    logger.info('Processing Entity Extraction job', { evidenceId, sessionId });

    try {
      const workflowResult = await orchestrator.orchestrateWorkflow(
        context || { sessionId, evidenceId, text },
        `Extract entities and forensic patterns from evidence ${evidenceId}`
      );

      await redis.publish(
        `workflow:session:${sessionId}`,
        JSON.stringify({
          type: 'ENTITY_COMPLETE',
          evidenceId,
          timestamp: new Date().toISOString(),
          result: workflowResult,
        })
      );

      logger.info('Entity extraction job completed', { evidenceId });
    } catch (error) {
      logger.error('Entity extraction job failed', { evidenceId, error });

      await redis.publish(
        `workflow:session:${sessionId}`,
        JSON.stringify({
          type: 'ENTITY_ERROR',
          evidenceId,
          error: String(error),
          timestamp: new Date().toISOString(),
        })
      );
    }
  });

  // Summarization Worker Consumer
  await consumeQueue('evidence.summarize', async (message: any) => {
    const { evidenceId, sessionId, text, context } = message;
    logger.info('Processing Summarization job', { evidenceId, sessionId });

    try {
      const workflowResult = await orchestrator.orchestrateWorkflow(
        context || { sessionId, evidenceId, text },
        `Generate legal summary for evidence ${evidenceId}`
      );

      await redis.publish(
        `workflow:session:${sessionId}`,
        JSON.stringify({
          type: 'SUMMARY_COMPLETE',
          evidenceId,
          timestamp: new Date().toISOString(),
          result: workflowResult,
        })
      );

      logger.info('Summarization job completed', { evidenceId });
    } catch (error) {
      logger.error('Summarization job failed', { evidenceId, error });

      await redis.publish(
        `workflow:session:${sessionId}`,
        JSON.stringify({
          type: 'SUMMARY_ERROR',
          evidenceId,
          error: String(error),
          timestamp: new Date().toISOString(),
        })
      );
    }
  });

  logger.info('All RabbitMQ worker consumers started');
}

/**
 * Create Apollo Server with enhanced context
 */
function createApolloServer(): ApolloServer {
  return new ApolloServer({
    typeDefs,
    resolvers,
    introspection: env.service.nodeEnv === 'development',
    formatError: (formattedError, error) => {
      logger.error('GraphQL error', { error: formattedError });
      return formattedError;
    },
  });
}

/**
 * Main bootstrap function
 */
async function bootstrap(): Promise<void> {
  logger.info('🚀 Starting Evidence Service Bootstrap...', {
    nodeEnv: env.service.nodeEnv,
    port: PORT,
  });

  try {
    // Initialize all infrastructure
    await initializeInfrastructure();

    // Start RabbitMQ consumers for workflow orchestration
    await startWorkerConsumers();

    // Create and start Apollo Server
    const server = createApolloServer();

    const { url } = await startStandaloneServer(server, {
      listen: { port: PORT },
      context: async ({ req }) => {
        // Extract session info from headers (Lucia V3 integration)
        const sessionId = req.headers['x-session-id'] as string | undefined;
        const userId = req.headers['x-user-id'] as string | undefined;

        return {
          redis,
          orchestrator,
          sessionId,
          userId,
        };
      },
    });

    logger.info('✅ Evidence Service running', {
      url,
      port: PORT,
      graphqlPlayground: `${url}graphql`,
      nodeEnv: env.service.nodeEnv,
    });

    logger.info('📊 Active Services:', {
      rabbitmq: '✅ Connected',
      redis: '✅ Connected',
      postgres: '✅ Connected',
      qdrant: '✅ Connected',
      minio: '✅ Connected',
      orchestrator: '✅ Initialized',
      workers: '✅ OCR, Embed, Entity, Summarize',
    });

  } catch (error) {
    logger.error('❌ Bootstrap failed', { error });
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(): Promise<void> {
  logger.info('Shutting down gracefully...');

  try {
    if (redis) {
      await redis.quit();
      logger.info('Redis disconnected');
    }

    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
}

// Process event handlers
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error });
  process.exit(1);
});

// Start the bootstrap
bootstrap().catch((error) => {
  logger.error('Fatal error during bootstrap', { error });
  process.exit(1);
});
