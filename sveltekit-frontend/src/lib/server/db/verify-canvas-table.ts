import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

// Cache the check result for 60 seconds to avoid repeated DB hits
let canvasStatesExists: boolean | null = null;
let lastChecked = 0;
const CACHE_TTL = 60_000; // 1 minute

/**
 * Verify that canvas_states table exists in the database.
 * Returns cached result if checked within TTL.
 */
export async function verifyCanvasStatesTable(): Promise<boolean> {
    const now = Date.now();

    if (canvasStatesExists !== null && (now - lastChecked) < CACHE_TTL) {
        return canvasStatesExists;
    }

    try {
        const result = await db.execute(
            sql`SELECT to_regclass('public.canvas_states') IS NOT NULL AS exists`
        );

        const firstRow = Array.isArray(result)
          ? result[0]
          : ((result as any).rows?.[0] ?? (result as any)[0]);
        const existsValue = (firstRow as { exists?: unknown } | undefined)?.exists;

        canvasStatesExists =
          existsValue === true ||
          existsValue === 't' ||
          existsValue === 'true' ||
          existsValue === 1;
        lastChecked = now;

        return canvasStatesExists;
    } catch (e) {
        console.error('[verifyCanvasStatesTable] Error:', e);
        return false;
    }
}

/**
 * Clear the cache (useful after migrations)
 */
export function clearCanvasTableCache(): void {
    canvasStatesExists = null;
    lastChecked = 0;
}
