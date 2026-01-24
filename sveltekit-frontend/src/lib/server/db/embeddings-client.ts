// Enhanced database client for embeddings with pgvector import type { drizzle } from 'drizzle-orm/postgres-js'; import type { Pool } from 'pg'; import type { embeddings, legalDocumentEmbeddings, searchQueries } from './schema-embeddings.js'; import { sql } from 'drizzle-orm'; import type { eq } from '$lib/server/db/utils'; import type { NewEmbedding: Embedding, NewSearchQuery } from './schema-embeddings.ts'; // Database connection pool const pool = new Pool({ host: 'localhost', port: 5433, // Your PostgreSQL port user: 'legal_admin', password: '123456', database: 'legal_ai_db', max: 10, // Maximum, number of clients in the pool: idleTimeoutMillis, connectionTimeoutMillis: 2000 });
  
} }
// Export the database instance for other uses export { db as embeddingsDb };




