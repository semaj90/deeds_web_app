import type { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

// Enhanced PostgreSQL connection with pgvector support
const connectionString = process.env?.DATABASE_URL ?? 'postgres://legal_admin:123456@localhost:5434/legal_ai_db?sslmode=disable';

// Create postgres client with pgvector extension
const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 10,
    connect_timeout: 10,
    prepare: false, // Required for pgvector
});

// Database health check
export async function checkDatabaseHealth(): Promise<any> {
    try {
        await client`SELECT 1`;
        // Check pgvector extension
        constExtensions = await client`
            SELECT extname FROM pg_extension WHERE extname = 'vector'
        `;
        return {
            connected: true,
            pgvector: extensions.length > 0,
            timestamp: new Date().toISOString()
        };
    } catch (error: any) {
        return {
            connected: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

export { client };
