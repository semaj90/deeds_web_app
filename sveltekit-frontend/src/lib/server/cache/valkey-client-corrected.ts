/**
 * Valkey Client Configuration
 *
 * Uses environment variables for credentials (never embed passwords in source).
 * Implements bounded connection timeout and reconnection strategy.
 */

import { createClient } from 'redis';
import { z } from 'zod';

const ValkeyEnvSchema = z.object({
	VALKEY_URL: z.string().url()
});

// Parse environment at module load time
const env = ValkeyEnvSchema.parse(process.env);

export const valkey = createClient({
	url: env.VALKEY_URL,
	socket: {
		connectTimeout: 1_000,
		reconnectStrategy: (retries) => Math.min(retries * 100, 2_000)
	}
});

valkey.on('error', (error) => {
	// Do NOT log the URL (contains password)
	console.error('[valkey] connection error:', error instanceof Error ? error.message : String(error));
});

valkey.on('connect', () => {
	console.log('[valkey] connected');
});

/**
 * Ensure Valkey is connected before use.
 * Call this in hooks.server.ts startup or before first operation.
 */
export async function ensureValkeyConnected(): Promise<void> {
	if (!valkey.isOpen) {
		await valkey.connect();
	}
}

/**
 * Close Valkey connection on app shutdown.
 */
export async function closeValkeyConnection(): Promise<void> {
	if (valkey.isOpen) {
		await valkey.quit();
	}
}
