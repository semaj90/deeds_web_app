// Centralized Drizzle ORM helpers and DB exports for the project
import { db } from '../unified-client.js';
import { sql } from 'drizzle-orm';
import * as pgCore from 'drizzle-orm/pg-core';
import { eq, and, or, gt, lt, like, not, asc, desc } from 'drizzle-orm';

// Re-exports
export const adminDb = db;
export * from 'drizzle-orm/pg-core';
export { eq, and, or, gt, lt, like, not, asc, desc, sql };

// Pgvector helper
export function pgvectorCosineSql(columnName: string, paramPlaceholder = '$1') {
    return sql`(1 - (${sql.raw(columnName)} <=> ${sql.raw(paramPlaceholder)}))`;
}

// Database Connection Helpers
export async function waitForDb(retries = 8, delayMs = 500): Promise<boolean> {
    for (let i = 0; i < retries; i++) {
        try {
            await db.execute(sql`SELECT 1`);
            return true;
        } catch {
            await new Promise(r => setTimeout(r, delayMs));
        }
    }
    return false;
}

// UUID helper
import { randomUUID } from 'crypto';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
export function genRandomUUID(): string {
    return randomUUID();
}

const _default = { db, adminDb, eq, and, or, gt, lt, like, not, asc, desc, sql, waitForDb, genRandomUUID };
export default _default;
