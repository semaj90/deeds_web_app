/**
 * Pattern Storage Service for LLM Self-Improvement System
 * Phase 72 - Task 9.2: Pattern Storage Integration
 *
 * Features:
 * - Store patterns in JSONL format with cluster metadata
 * - Create Neo4j nodes for each pattern
 * - Link patterns to fix strategies in the graph
 *
 * **Validates: Requirements 10.4**
 */

import type { ErrorPattern, FixStrategy, ErrorRelationship } from './types.js';
import { getJSONLStorage } from './JSONLStorage.js';
import { getKAGTraverser } from './KAGTraverser.js';
import type { ClusterResult } from './ErrorClustering.js';

export interface PatternStorageConfig {
	jsonlDir: string;
	neo4jEnabled: boolean;
	maxCachedPatterns: number;
}

export interface StorageResult {
	success: boolean;
	patternId: string;
	jsonlWritten: boolean;
	neo4jWritten: boolean;
	error?: string;
}

export interface PatternQuery {
	errorType?: string;
	minOccurrences?: number;
	minSuccessRate?: number;
	limit?: number;
}


/**
 * Pattern Storage Service
 * Manages persistence of error patterns to JSONL and Neo4j
 */
export class PatternStorage {
	private config: PatternStorageConfig;
	private patterns: Map<string, ErrorPattern> = new Map();
	private stats = {
		totalStored: 0,
		jsonlWrites: 0,
		neo4jWrites: 0,
		linkagesCreated: 0
	};

	constructor(config?: Partial<PatternStorageConfig>) {
		this.config = {
			jsonlDir: config?.jsonlDir ?? './data/patterns',
			neo4jEnabled: config?.neo4jEnabled ?? true,
			maxCachedPatterns: config?.maxCachedPatterns ?? 5000
		};
	}

	/**
	 * Store a pattern from cluster result
	 */
	async storePattern(pattern: ErrorPattern): Promise<StorageResult> {
		const result: StorageResult = {
			success: false,
			patternId: pattern.id,
			jsonlWritten: false,
			neo4jWritten: false
		};

		try {
			// Store in JSONL
			const jsonlStorage = getJSONLStorage({ baseDir: this.config.jsonlDir });
			const writeResult = await jsonlStorage.writePattern(pattern);
			result.jsonlWritten = writeResult.success;
			if (writeResult.success) {
				this.stats.jsonlWrites++;
			}

			// Store in Neo4j if enabled
			if (this.config.neo4jEnabled) {
				const neo4jResult = await this.storeInNeo4j(pattern);
				result.neo4jWritten = neo4jResult;
				if (neo4jResult) {
					this.stats.neo4jWrites++;
				}
			}

			// Cache locally (prune oldest if over limit)
			this.patterns.set(pattern.id, pattern);
			if (this.patterns.size > this.config.maxCachedPatterns) {
				const excess = this.patterns.size - this.config.maxCachedPatterns;
				const keys = [...this.patterns.keys()].slice(0, excess);
				for (const k of keys) this.patterns.delete(k);
			}
			this.stats.totalStored++;

			result.success = result.jsonlWritten || result.neo4jWritten;
		} catch (error) {
			result.error = error instanceof Error ? error.message : String(error);
		}

		return result;
	}


	/**
	 * Store pattern in Neo4j knowledge graph
	 */
	private async storeInNeo4j(pattern: ErrorPattern): Promise<boolean> {
		try {
			const kag = getKAGTraverser();

			// Create pattern node
			const cypher = `
				MERGE (p:ErrorPattern {id: $id})
				SET p.pattern = $pattern, p.errorType = $errorType, p.successRate = $successRate, p.occurrences = $occurrences, p.clusterId = $clusterId, p.clusterSize = $clusterSize, p.commonFeatures = $commonFeatures, p.lastSeen = datetime(),
				    p.updatedAt = datetime()
				RETURN p
			`;

			await kag.executeQuery(cypher, {
				id: pattern.id,
				pattern: pattern.pattern,
				errorType: pattern.errorType,
				successRate: pattern.successRate,
				occurrences: pattern.occurrences,
				clusterId: pattern.clusterMetadata.clusterId,
				clusterSize: pattern.clusterMetadata.size,
				commonFeatures: pattern.clusterMetadata.commonFeatures
			});

			return true;
		} catch (error) {
			console.warn('Failed to store pattern in Neo4j: ' + error);
			return false;
		}
	}

	/**
	 * Link pattern to fix strategies in Neo4j
	 */
	async linkToStrategies(
		patternId: string,
		strategies: FixStrategy[]
	): Promise<number> {
		if (!this.config.neo4jEnabled) return 0;

		let linked = 0;
		const kag = getKAGTraverser();

		for (const strategy of strategies) {
			try {
				// Create strategy node if not exists
				const strategyCypher = `
					MERGE (s:FixStrategy {id: $strategyId})
					SET s.description = $description, s.successRate = $successRate, s.confidence = $confidence, s.appliedCount = $appliedCount, s.updatedAt = datetime()
					RETURN s
				`;

				await kag.executeQuery(strategyCypher, {
					strategyId: strategy.id,
					description: strategy.description,
					successRate: strategy.successRate,
					confidence: strategy.confidence,
					appliedCount: strategy.appliedCount
				});

				// Link pattern to strategy
				const linkCypher = `
					MATCH (p:ErrorPattern {id: $patternId})
					MATCH (s:FixStrategy {id: $strategyId})
					MERGE (p)-[r:FIXED_BY]->(s)
					SET r.weight = $weight, r.updatedAt = datetime()
					RETURN r
				`;

				await kag.executeQuery(linkCypher, {
					patternId,
					strategyId: strategy.id,
					weight: strategy.successRate
				});

				linked++;
				this.stats.linkagesCreated++;
			} catch (error) {
				console.warn('Failed to link strategy ' + strategy.id + ': ' + error);
			}
		}

		return linked;
	}


	/**
	 * Create relationship between patterns
	 */
	async createPatternRelationship(
		fromPatternId: string,
		toPatternId: string,
		relationshipType: 'similar_to' | 'causes' | 'related_to'
	): Promise<boolean> {
		if (!this.config.neo4jEnabled) return false;

		try {
			const kag = getKAGTraverser();
			const cypher = `
				MATCH (p1:ErrorPattern {id: $fromId})
				MATCH (p2:ErrorPattern {id: $toId})
				MERGE (p1)-[r:${relationshipType.toUpperCase()}]->(p2)
				SET r.createdAt = datetime()
				RETURN r
			`;

			await kag.executeQuery(cypher, {
				fromId: fromPatternId,
				toId: toPatternId
			});

			this.stats.linkagesCreated++;
			return true;
		} catch (error) {
			console.warn('Failed to create relationship: ' + error);
			return false;
		}
	}

	/**
	 * Query patterns from storage
	 */
	async queryPatterns(query: PatternQuery): Promise<ErrorPattern[]> {
		const results: ErrorPattern[] = [];

		// First check local cache
		for (const pattern of this.patterns.values()) {
			if (this.matchesQuery(pattern, query)) {
				results.push(pattern);
			}
		}

		// If Neo4j enabled, also query from graph
		if (this.config.neo4jEnabled && results.length < (query.limit ?? 100)) {
			const neo4jPatterns = await this.queryFromNeo4j(query);
			for (const p of neo4jPatterns) {
				if (!this.patterns.has(p.id)) {
					results.push(p);
					this.patterns.set(p.id, p);
				}
			}
			// Prune cache if over limit after Neo4j load
			if (this.patterns.size > this.config.maxCachedPatterns) {
				const excess = this.patterns.size - this.config.maxCachedPatterns;
				const keys = [...this.patterns.keys()].slice(0, excess);
				for (const k of keys) this.patterns.delete(k);
			}
		}

		return results.slice(0, query.limit ?? 100);
	}

	/**
	 * Check if pattern matches query
	 */
	private matchesQuery(pattern: ErrorPattern, query: PatternQuery): boolean {
		if (query.errorType && pattern.errorType !== query.errorType) return false;
		if (query.minOccurrences && pattern.occurrences < query.minOccurrences) return false;
		if (query.minSuccessRate && pattern.successRate < query.minSuccessRate) return false;
		return true;
	}


	/**
	 * Query patterns from Neo4j
	 */
	private async queryFromNeo4j(query: PatternQuery): Promise<ErrorPattern[]> {
		try {
			const kag = getKAGTraverser();

			let whereClause = '';
			const params: Record<string, any> = {};

			if (query.errorType) {
				whereClause += ' AND p.errorType = $errorType';
				params.errorType = query.errorType;
			}
			if (query.minOccurrences) {
				whereClause += ' AND p.occurrences >= $minOccurrences';
				params.minOccurrences = query.minOccurrences;
			}
			if (query.minSuccessRate) {
				whereClause += ' AND p.successRate >= $minSuccessRate';
				params.minSuccessRate = query.minSuccessRate;
			}

			const cypher = `
				MATCH (p:ErrorPattern)
				WHERE 1=1 ${whereClause}
				RETURN p
				ORDER BY p.occurrences DESC
				LIMIT $limit
			`;
			params.limit = query.limit ?? 100;

			const result = await kag.executeQuery(cypher, params);

			return result.records?.map((r: any) => this.neo4jToPattern(r.get('p'))) || [];
		} catch (error) {
			console.warn('Failed to query Neo4j: ' + error);
			return [];
		}
	}

	/**
	 * Convert Neo4j node to ErrorPattern
	 */
	private neo4jToPattern(node: any): ErrorPattern {
		const props = node?.properties || node;
		return {
			id: props.id,
			pattern: props.pattern,
			embedding: [],
			errorType: props.errorType,
			fixStrategies: [],
			clusterMetadata: {
				clusterId: props.clusterId,
				centroid: [],
				size: props?.clusterSize ?? 0,
				commonFeatures: props?.commonFeatures || []
			},
			successRate: props?.successRate ?? 0,
			occurrences: props?.occurrences ?? 0,
			lastSeen: new Date(props?.lastSeen || Date.now()),
			createdAt: new Date(props?.createdAt || Date.now())
		};
	}

	/**
	 * Get pattern by ID
	 */
	getPattern(patternId: string): ErrorPattern | undefined {
		return this.patterns.get(patternId);
	}

	/**
	 * Get storage statistics
	 */
	getStats() {
		return {
			...this.stats,
			cachedPatterns: this.patterns.size
		};
	}

	/**
	 * Clear local cache
	 */
	clearCache(): void {
		this.patterns.clear();
	}
}

/**
 * Singleton instance
 */
let patternStorageInstance: PatternStorage | null = null;

/**
 * Get or create PatternStorage singleton
 */
export function getPatternStorage(config?: Partial<PatternStorageConfig>): PatternStorage {
	if (!patternStorageInstance) {
		patternStorageInstance = new PatternStorage(config);
	}
	return patternStorageInstance;
}