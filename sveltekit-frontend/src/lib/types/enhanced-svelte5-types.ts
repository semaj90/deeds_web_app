import { browser } from '$app/environment';
import type * as schema from '$lib/server/db/schema-postgres';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * Superior Drizzle ORM types for legal_ai_db
 */
export interface DrizzleTypes {
	Database: PostgresJsDatabase<typeof schema>;
	Schema: typeof schema;
	// Inferred table types
	User: typeof schema.users.$inferSelect;
	NewUser: typeof schema.users.$inferInsert;
	Case: typeof schema.cases.$inferSelect;
	NewCase: typeof schema.cases.$inferInsert;
	Evidence: typeof schema.evidence.$inferSelect;
	NewEvidence: typeof schema.evidence.$inferInsert;
}

export interface CachingTypes {
	ttl: number;
	strategy: 'memory' | 'redis' | 'hybrid';
}

export const detectEnvironment = () => {
	if (browser) return 'browser';
	return 'server';
};

export type BitsUI = any;
