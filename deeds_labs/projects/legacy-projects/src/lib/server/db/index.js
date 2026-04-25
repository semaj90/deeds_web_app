import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DATABASE_URL } from '$env/static/private';
import * as schema from './schema.js';

// Database connection configuration
const connectionString =
  DATABASE_URL || 'postgresql://postgres:superuser@localhost:5432/deeds_legal';

// Create postgres client with proper configuration
const client = postgres(connectionString, {
  max: 10, // Maximum number of connections
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout in seconds
  prepare: false, // Disable prepared statements for better compatibility
  types: {
    // Handle vector type for pgvector
    vector: {
      to: 1184,
      from: [1184],
      serialize: (x) => x,
      parse: (x) => x,
    },
  },
});

// Create Drizzle database instance
export const db = drizzle(client, {
  schema,
  logger: process.env.NODE_ENV === 'development',
});

// Database health check function
export async function healthCheck() {
  try {
    await client`SELECT 1`;
    return { status: 'healthy', timestamp: new Date().toISOString() };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing database connection...');
  await client.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Closing database connection...');
  await client.end();
  process.exit(0);
});

export default db;
