import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { typeDefs } from './graphql/schema.js';
import { resolvers } from './graphql/resolvers/index.js';
import { connectRabbitMQ } from './mq/connect.js';
import { ensureBucket } from './storage/minio.js';
import { ensureCollection } from './rag/qdrant.js';
import { env } from './env.js';
import { logger } from './utils/logger.js';

async function main() {
  logger.info('Starting Evidence Service...');

  // Initialize infrastructure
  try {
    logger.info('Connecting to RabbitMQ...');
    await connectRabbitMQ();

    logger.info('Ensuring MinIO bucket exists...');
    await ensureBucket();

    logger.info('Ensuring Qdrant collection exists...');
    await ensureCollection();

    logger.info('Infrastructure initialized');
  } catch (error) {
    logger.error('Failed to initialize infrastructure', { error });
    process.exit(1);
  }

  // Create Apollo Server
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: true,
  });

  // Start server
  const { url } = await startStandaloneServer(server, {
    listen: { port: env.service.port },
    context: async () => ({}),
  });

  logger.info(`🚀 Evidence Service ready at ${url}`);
  logger.info(`📊 GraphQL Playground: ${url}`);
}

main().catch((error) => {
  logger.error('Failed to start server', { error });
  process.exit(1);
});

process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down gracefully...');
  process.exit(0);
});
