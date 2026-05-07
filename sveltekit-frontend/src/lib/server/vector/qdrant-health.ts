/**
 * Qdrant Collection Health Check & Auto-Initialization
 * Priority #2: Ensure all required collections exist with correct schemas
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { ENV } from '$lib/server/env.server.js';
import { VECTOR_CONFIG } from '$lib/server/config/vector-config.js';

export interface CollectionHealth {
	name: string;
	exists: boolean;
	vectorCount?: number;
	schemaValid?: boolean;
	issues?: string[];
	config?: {
		vectorSize?: number;
		distance?: string;
		quantization?: string;
	};
}

export interface QdrantHealthReport {
	healthy: boolean;
	collections: CollectionHealth[];
	totalVectors: number;
	missingCollections: string[];
	schemaIssues: string[];
	latencyMs: number;
	timestamp: string;
}

/**
 * Expected collection schemas — derived from VECTOR_CONFIG (single source of truth)
 */
export const COLLECTION_SCHEMAS = Object.fromEntries(
	Object.entries(VECTOR_CONFIG.COLLECTION_VECTORS).map(([name, schema]) => [
		name,
		{
			vectors: schema.vectors,
			size: VECTOR_CONFIG.DIMENSIONS,
			distance: VECTOR_CONFIG.DISTANCE_METRIC.QDRANT,
			quantized: true,
		},
	])
) as Record<string, { vectors: readonly string[]; size: number; distance: string; quantized: boolean }>;

type QdrantCollectionConfig = {
  params?: {
    vectors?: unknown;
  };
  quantization_config?: unknown;
};

function hasCollectionQuantization(collectionInfo: { config?: QdrantCollectionConfig }): boolean {
  return Boolean(collectionInfo.config?.quantization_config);
}

/**
 * Check health of all Qdrant collections
 */
export async function checkQdrantHealth(
  client: QdrantClient,
  options: { timeout?: number; includeVectorCounts?: boolean } = {}
): Promise<QdrantHealthReport> {
  const start = Date.now();
  const timeout = options.timeout ?? 5000;
  const includeVectorCounts = options.includeVectorCounts ?? false;

  const collections: CollectionHealth[] = [];
  const missingCollections: string[] = [];
  const schemaIssues: string[] = [];
  let totalVectors = 0;

  try {
    // Get all existing collections
    const existingCollections = await Promise.race([
      client.getCollections(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout)),
    ]);

    const existingNames = new Set(existingCollections.collections.map((c) => c.name));

    // Check each expected collection
    for (const [name, expectedSchema] of Object.entries(COLLECTION_SCHEMAS)) {
      const exists = existingNames.has(name);

      if (!exists) {
        missingCollections.push(name);
        collections.push({
          name,
          exists: false,
          issues: ['Collection does not exist'],
        });
        continue;
      }

      // Collection exists - verify schema
      try {
        const collectionInfo = await client.getCollection(name);
        const issues: string[] = [];
        let schemaValid = true;

        // Check vector config
        const config = collectionInfo.config?.params;
        if (!config?.vectors) {
          issues.push('No vector configuration found');
          schemaValid = false;
        } else {
          // Named vectors vs single vector
          const hasNamedVectors = typeof config.vectors === 'object' && !('size' in config.vectors);

          if (hasNamedVectors) {
            // Named vectors (e.g., legal_documents: content + summary)
            const vectorNames = Object.keys(config.vectors);
            const expectedVectors = expectedSchema.vectors;

            // Check all expected vectors exist
            for (const expectedVector of expectedVectors) {
              if (expectedVector === 'default') continue; // Single vector collections

              if (!vectorNames.includes(expectedVector)) {
                issues.push(`Missing vector: ${expectedVector}`);
                schemaValid = false;
              } else {
                // Verify vector size
                const vectorConfig = (config.vectors as any)[expectedVector];
                if (vectorConfig.size !== expectedSchema.size) {
                  issues.push(
                    `Vector ${expectedVector} size mismatch: expected ${expectedSchema.size}, got ${vectorConfig.size}`
                  );
                  schemaValid = false;
                }

                // Verify distance metric
                if (vectorConfig.distance !== expectedSchema.distance) {
                  issues.push(
                    `Vector ${expectedVector} distance mismatch: expected ${expectedSchema.distance}, got ${vectorConfig.distance}`
                  );
                  schemaValid = false;
                }
              }
            }
          } else {
            // Single unnamed vector
            const vectorConfig = config.vectors as any;
            if (vectorConfig.size !== expectedSchema.size) {
              issues.push(
                `Vector size mismatch: expected ${expectedSchema.size}, got ${vectorConfig.size}`
              );
              schemaValid = false;
            }

            if (vectorConfig.distance !== expectedSchema.distance) {
              issues.push(
                `Distance mismatch: expected ${expectedSchema.distance}, got ${vectorConfig.distance}`
              );
              schemaValid = false;
            }
          }
        }

        // Check quantization (non-critical - just log if missing)
        if (
          expectedSchema.quantized &&
          !hasCollectionQuantization(collectionInfo as { config?: QdrantCollectionConfig })
        ) {
          issues.push('Quantization not enabled (performance warning)');
          // Don't mark as invalid - quantization is optional optimization
        }

        // Get vector count if requested
        let vectorCount = 0;
        if (includeVectorCounts) {
          vectorCount = collectionInfo.vectors_count ?? 0;
          totalVectors += vectorCount;
        }

        collections.push({
          name,
          exists: true,
          schemaValid,
          vectorCount: includeVectorCounts ? vectorCount : undefined,
          issues: issues.length > 0 ? issues : undefined,
          config: {
            vectorSize: expectedSchema.size,
            distance: expectedSchema.distance,
            quantization: expectedSchema.quantized ? 'int8' : 'none',
          },
        });

        if (!schemaValid) {
          schemaIssues.push(`${name}: ${issues.join(', ')}`);
        }
      } catch (err) {
        collections.push({
          name,
          exists: true,
          schemaValid: false,
          issues: [`Failed to verify schema: ${err}`],
        });
        schemaIssues.push(`${name}: verification failed`);
      }
    }

    const healthy = missingCollections.length === 0 && schemaIssues.length === 0;

    return {
      healthy,
      collections,
      totalVectors,
      missingCollections,
      schemaIssues,
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[QdrantHealth] Check failed:', err);
    return {
      healthy: false,
      collections: [],
      totalVectors: 0,
      missingCollections: Object.keys(COLLECTION_SCHEMAS),
      schemaIssues: ['Failed to connect to Qdrant or list collections'],
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Auto-create missing collections
 * Returns list of collections that were created
 */
export async function ensureCollections(client: QdrantClient): Promise<string[]> {
	const created: string[] = [];

	// Import QdrantManager for collection configs
	const { qdrant } = await import('./qdrant-manager.js');

	try {
		// Run initializeCollections (idempotent - skips existing)
		await qdrant.initializeCollections();

		// Verify all collections now exist
		const health = await checkQdrantHealth(client, { timeout: 3000 });

		if (health.missingCollections.length > 0) {
			console.warn(
				'⚠️ Some collections still missing after initialization:',
				health.missingCollections
			);
		}

		// Log schema issues (non-fatal - collections exist but may need recreation)
		if (health.schemaIssues.length > 0) {
			console.warn('⚠️ Schema issues detected:', health.schemaIssues);
			console.warn(
				'   To fix: Delete collection and restart server to recreate with correct schema'
			);
		}

		// Return list of collections that were likely created (no way to track individual creates)
		return health.missingCollections.length === 0
			? Object.keys(COLLECTION_SCHEMAS)
			: [];
	} catch (err) {
		console.error('❌ Failed to ensure collections:', err);
		return [];
	}
}

/**
 * Get Qdrant server info (version, uptime, etc.)
 */
export async function getQdrantServerInfo(client: QdrantClient): Promise<{
	version?: string;
	healthy: boolean;
	latencyMs: number;
}> {
	const start = Date.now();

	try {
		// Qdrant root endpoint returns version info
		const response = await fetch(ENV.QDRANT_URL, {
			signal: AbortSignal.timeout(2000)
		});

		if (!response.ok) {
			return {
				healthy: false,
				latencyMs: Date.now() - start
			};
		}

		const data = await response.json();
		return {
			version: data.version ?? data.title ?? 'unknown',
			healthy: true,
			latencyMs: Date.now() - start
		};
	} catch (err) {
		return {
			healthy: false,
			latencyMs: Date.now() - start
		};
	}
}
