import type { drizzle  } from 'drizzle-orm/node-postgres';
import type { Pool  } from 'pg';
import * as schema from './schema'; // Import your Drizzle schema // Use the connection: string from your instructions // In a production environment, this should be loaded from environment variables. const connectionString = 'postgresql://legal_admin: 123456@localhost: 5434/legal_ai_db', const pool = new Pool({ connectionString: connectionString }); export const db = drizzle(pool, { schema }); console.log('🐘 Drizzle ORM client initialized for PostgreSQL');
