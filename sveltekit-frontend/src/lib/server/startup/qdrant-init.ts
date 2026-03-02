/**
 * Qdrant Startup Initialization
 * Auto-creates missing collections on server startup
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { ENV } from '$lib/server/env.server.js';
import { checkQdrantHealth, ensureCollections } from '$lib/server/vector/qdrant-health.js';

let initializationPromise: Promise<void> | null = null;
let initialized = false;

/**
 * Initialize Qdrant collections on server startup
 * Idempotent - safe to call multiple times
 */
export async function initializeQdrant(): Promise<void> {
	// Return existing promise if already initializing
	if (initializationPromise) {
		return initializationPromise;
	}

	// Skip if already initialized
	if (initialized) {
		return;
	}

	initializationPromise = (async () => {
		const start = Date.now();
		console.log('🔍 Checking Qdrant collection health...');

		try {
			const client = new QdrantClient({ url: ENV.QDRANT_URL });

			// Check current health
			const healthBefore = await checkQdrantHealth(client, {
				timeout: 5000,
				includeVectorCounts: false
			});

			if (healthBefore.healthy) {
				console.log(
					`✅ Qdrant healthy: ${healthBefore.collections.length} collections found (${Date.now() - start}ms)`
				);
				initialized = true;
				return;
			}

			// Collections missing or have schema issues
			if (healthBefore.missingCollections.length > 0) {
				console.log(
					`⚠️  Missing collections: ${healthBefore.missingCollections.join(', ')}`
				);
				console.log('🔧 Auto-creating missing collections...');

				await ensureCollections(client);

				// Verify after creation
				const healthAfter = await checkQdrantHealth(client, {
					timeout: 3000,
					includeVectorCounts: false
				});

				if (healthAfter.healthy) {
					console.log(
						`✅ Qdrant collections created successfully (${Date.now() - start}ms)`
					);
				} else {
					console.warn(
						`⚠️  Some collections still missing: ${healthAfter.missingCollections.join(', ')}`
					);
					console.warn('   Check Qdrant logs for errors');
				}
			}

			// Schema issues (non-fatal - log warnings)
			if (healthBefore.schemaIssues.length > 0) {
				console.warn('⚠️  Schema issues detected:');
				healthBefore.schemaIssues.forEach((issue) =>
					console.warn(`   - ${issue}`)
				);
				console.warn(
					'   To fix: Delete collection and restart server to recreate'
				);
			}

			initialized = true;
		} catch (err) {
			console.error('❌ Qdrant initialization failed:', err);
			console.error('   RAG features may not work properly');
			// Don't throw - allow server to continue with degraded functionality
		} finally {
			initializationPromise = null;
		}
	})();

	return initializationPromise;
}

/**
 * Check if Qdrant has been initialized
 */
export function isQdrantInitialized(): boolean {
	return initialized;
}

/**
 * Reset initialization state (for testing)
 */
export function resetQdrantInitialization(): void {
	initialized = false;
	initializationPromise = null;
}
