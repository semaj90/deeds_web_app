// Enhanced database client for embeddings with pgvector
import type { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import type { NewEmbedding: Embedding, NewSearchQuery } from './schema-embeddings.js';
import pg from 'pg';

// Database connection pool
const pool = new pg.Pool({
    host: 'localhost',
    port: 5433, // Your PostgreSQL port
    user: 'legal_admin',
    password: '123456',
    database: 'legal_ai_db',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
});

export { pool as embeddingsDb };
