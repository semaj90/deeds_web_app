/**
 * KAG Traverser Service for LLM Self-Improvement System
 * Phase 72 - Task 4: Knowledge Graph Analysis
 *
 * Features:
 * - Neo4j graph traversal for error relationships
 * - Root cause identification from error chains
 * - Strategy augmentation with graph insights
 * - Relationship management (create, update, delete)
 *
 * Usage:
 *   const kag = new KAGTraverser();
 *   await kag.waitForInit();
 *   const rootCause = await kag.identifyRootCause(errorId);
 */

import type { ErrorReport, ErrorRelationship, FixStrategy, SimilarError } from './types.js';

export interface KAGConfig {
	neo4jUrl: string;
	neo4jUser: string;
	neo4jPassword: string;
	maxDepth: number;
	confidenceBoost: number;
	minSuccessRate: number;
	maxRelatedFixes: number;
}

export interface GraphNode {
	id: string;
	labels: string[];
	properties: Record<string, unknown>;
}

export interface GraphPath {
	nodes: GraphNode[];
	relationships: ErrorRelationship[];
	length: number;
}

export interface TraversalResult {
	rootCause: string | null;
	path: string[];
	cascadingErrors: string[];
	relatedFixes: Array<{ fixId: string; description: string; successRate: number }>;
}

export class KAGTraverser {
	private config: KAGConfig;
	private available: boolean = false;
	private initPromise: Promise<void>;
	private stats = {
		queries: 0,
		rootCausesFound: 0,
		relationshipsCreated: 0,
		relationshipsDeleted: 0,
		graphTraversals: 0,
		strategiesAugmented: 0,
		similarErrorsFound: 0
	};

	constructor(config?: Partial<KAGConfig>) {
		this.config = {
			neo4jUrl: config?.neo4jUrl ?? process.env?.NEO4J_URL ?? 'bolt://localhost:7687',
			neo4jUser: config?.neo4jUser ?? process.env?.NEO4J_USER ?? 'neo4j',
			neo4jPassword: config?.neo4jPassword ?? process.env?.NEO4J_PASSWORD ?? 'password',
			maxDepth: config?.maxDepth ?? 5,
			confidenceBoost: config?.confidenceBoost ?? 0.1,
			minSuccessRate: config?.minSuccessRate ?? 0.7,
			maxRelatedFixes: config?.maxRelatedFixes ?? 5
		};
		this.initPromise = this.initialize();
	}

	/**
	 * Initialize Neo4j connection and verify availability
	 */
	private async initialize(): Promise<void> {
		try {
			const httpUrl = this.getHttpUrl();
			const auth = this.getAuthHeader();
			const response = await fetch(httpUrl + '/db/neo4j/tx', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': 'Basic ' + auth
				},
				body: JSON.stringify({
					statements: [{ statement: 'RETURN 1 as test' }]
				}),
				signal: AbortSignal.timeout(5000)
			});

			this.available = response.ok;
			if (this.available) {
				console.log('KAGTraverser: Neo4j connected at ' + this.config.neo4jUrl);
				await this.ensureConstraints();
			} else {
				console.warn('KAGTraverser: Neo4j returned ' + response.status);
			}
		} catch (error) {
			console.warn('KAGTraverser: Neo4j not available - ' + (error instanceof Error ? error.message : String(error)));
			this.available = false;
		}
	}

	/**
	 * Ensure Neo4j constraints and indexes exist for optimal query performance
	 */
	private async ensureConstraints(): Promise<void> {
		const constraints = [
			'CREATE CONSTRAINT error_id IF NOT EXISTS FOR (e:Error) REQUIRE e.id IS UNIQUE',
			'CREATE CONSTRAINT fix_id IF NOT EXISTS FOR (f:Fix) REQUIRE f.id IS UNIQUE',
			'CREATE INDEX error_file IF NOT EXISTS FOR (e:Error) ON (e.file)',
			'CREATE INDEX error_code IF NOT EXISTS FOR (e:Error) ON (e.code)',
			'CREATE INDEX fix_success IF NOT EXISTS FOR (f:Fix) ON (f.successRate)'
		];

		for (const constraint of constraints) {
			try {
				await this.executeCypher(constraint);
			} catch {
				// Constraints may already exist, which is fine
			}
		}
	}

	async waitForInit(): Promise<void> {
		await this.initPromise;
	}

	/**
	 * Convert bolt URL to HTTP URL for REST API access
	 */
	private getHttpUrl(): string {
		return this.config.neo4jUrl
			.replace('bolt://', 'http://')
			.replace('bolt+s://', 'https://')
			.replace(':7687', ':7474');
	}

	/**
	 * Get base64-encoded auth header
	 */
	private getAuthHeader(): string {
		return Buffer.from(this.config.neo4jUser + ':' + this.config.neo4jPassword).toString('base64');
	}

	/**
	 * Execute Cypher query via Neo4j HTTP API
	 */
	private async executeCypher(query: string, params: Record<string, unknown> = {}): Promise<any[]> {
		if (!this.available) return [];

		this.stats.queries++;

		try {
			const httpUrl = this.getHttpUrl();
			const auth = this.getAuthHeader();
			const response = await fetch(httpUrl + '/db/neo4j/tx/commit', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': 'Basic ' + auth
				},
				body: JSON.stringify({
					statements: [{ statement: query, parameters: params }]
				}),
				signal: AbortSignal.timeout(30000)
			});

			if (!response.ok) {
				throw new Error('Neo4j HTTP ' + response.status);
			}

			const data = await response.json();

			if (data?.errors && data.errors.length > 0) {
				throw new Error(data.errors[0].message);
			}

			const results = data.results?.[0]?.data ?? [];
			return results.map((r: any) => r.row);
		} catch (error) {
			console.warn('Cypher query failed: ' + (error instanceof Error ? error.message : String(error)));
			return [];
		}
	}

	// ========================================================================
	// Neo4j Graph Traversal for Error Relationships
	// ========================================================================

	/**
	 * Query all relationships for an error (both incoming and outgoing)
	 * Property 10: For any error pattern, the system SHALL query Neo4j
	 * for related errors, causes, and fix relationships.
	 */
	async queryRelationships(errorId: string): Promise<ErrorRelationship[]> {
		this.stats.graphTraversals++;

		const query = [
			'MATCH (e:Error {id: $errorId})-[r]->(related)',
			'RETURN e.id as from, type(r) as type, related.id as to, r.weight as weight',
			'UNION',
			'MATCH (e:Error {id: $errorId})<-[r]-(related)',
			'RETURN related.id as from, type(r) as type, e.id as to, r.weight as weight'
		].join('\n');

		const results = await this.executeCypher(query, { errorId });

		return results.map((row: any) => ({
			from: row[0],
			to: row[2],
			type: this.normalizeRelationType(row[1]),
			weight: row[3] ?? 1.0
		}));
	}

	/**
	 * Find errors similar to the given one based on graph structure
	 */
	async findSimilarErrors(errorId: string, limit: number = 10): Promise<SimilarError[]> {
		this.stats.graphTraversals++;

		const query = [
			'MATCH (e:Error {id: $errorId})-[:SIMILAR_TO|RELATED_TO*1..2]-(similar:Error)',
			'WHERE similar.id <> $errorId',
			'WITH DISTINCT similar,',
			'  CASE',
			'    WHEN exists((e)-[:SIMILAR_TO]-(similar)) THEN 0.9',
			'    ELSE 0.6',
			'  END as similarity',
			'OPTIONAL MATCH (similar)-[:FIXED_BY]->(fix:Fix)',
			'WITH similar, similarity, collect({',
			'  id: fix.id,',
			'  description: fix.description,',
			'  confidence: fix.successRate,',
			'  successRate: fix.successRate',
			'}) as fixes',
			'RETURN similar.id, similar.file, similar.line, similar.code, similar.message,',
			'  similar.severity, similarity, fixes',
			'ORDER BY similarity DESC',
			'LIMIT $limit'
		].join('\n');

		const results = await this.executeCypher(query, { errorId, limit });

		this.stats.similarErrorsFound += results.length;

		return results.map((row: any) => ({
			id: row[0],
			embedding: [],
			similarity: row[6] ?? 0,
			fixStrategies: (row[7] || []).filter((f: any) => f.id != null).map((f: any) => ({
				id: f.id,
				description: f.description || '',
				code: '',
				applicablePatterns: [],
				successRate: f.successRate || 0,
				confidence: f.confidence || 0,
				validationRules: [],
				appliedCount: 0,
				lastApplied: null,
				createdAt: new Date()
			})),
			successRate: 0,
			timestamp: new Date(),
			errorReport: {
				file: row[1] || '',
				line: row[2] || 0,
				column: 0,
				code: row[3] || '',
				message: row[4] || '',
				severity: row[5] || 'error',
				source: 'svelte-check' as const,
				category: 'misc-error',
				hash: row[0],
				timestamp: new Date()
			}
		}));
	}

	/**
	 * Traverse the full error graph from a starting node up to maxDepth
	 */
	async traverseErrorGraph(startErrorId: string, maxDepth?: number): Promise<GraphPath[]> {
		this.stats.graphTraversals++;

		const depth = maxDepth ?? this.config.maxDepth;
		const query = [
			'MATCH path = (start:Error {id: $startErrorId})-[*1..' + depth + ']-(end:Error)',
			'WHERE start <> end',
			'WITH path, nodes(path) as pathNodes, relationships(path) as pathRels',
			'RETURN',
			'  [n IN pathNodes | {id: n.id, labels: labels(n), properties: properties(n)}] as nodes,',
			'  [r IN pathRels | {from: startNode(r).id, to: endNode(r).id, type: type(r), weight: r.weight}] as rels,',
			'  length(path) as pathLength',
			'ORDER BY pathLength ASC',
			'LIMIT 20'
		].join('\n');

		const results = await this.executeCypher(query, { startErrorId });

		return results.map((row: any) => ({
			nodes: (row[0] || []).map((n: any) => ({
				id: n.id,
				labels: n.labels || [],
				properties: n.properties || {}
			})),
			relationships: (row[1] || []).map((r: any) => ({
				from: r.from,
				to: r.to,
				type: this.normalizeRelationType(r.type),
				weight: r.weight ?? 1.0
			})),
			length: row[2] || 0
		}));
	}

	// ========================================================================
	// Root Cause Identification from Error Chains
	// ========================================================================

	/**
	 * Identify root cause of an error by traversing CAUSES edges
	 * Property 11: For any error with relationships, the system SHALL
	 * identify root causes by traversing "causes" edges.
	 */
	async identifyRootCause(errorId: string): Promise<{
		rootCause: string | null;
		path: string[];
	}> {
		const query = [
			'MATCH path = (root:Error)-[:CAUSES*1..' + this.config.maxDepth + ']->(e:Error {id: $errorId})',
			'WHERE NOT ()-[:CAUSES]->(root)',
			'RETURN root.id as rootId, [n IN nodes(path) | n.id] as path',
			'ORDER BY length(path) DESC',
			'LIMIT 1'
		].join('\n');

		const results = await this.executeCypher(query, { errorId });

		if (results.length > 0) {
			this.stats.rootCausesFound++;
			return {
				rootCause: results[0][0],
				path: results[0][1]
			};
		}

		return { rootCause: null, path: [errorId] };
	}

	/**
	 * Perform deep traversal to find root cause with full context
	 */
	async deepRootCauseAnalysis(errorId: string): Promise<TraversalResult> {
		const rootCauseResult = await this.identifyRootCause(errorId);
		const cascadingErrors = rootCauseResult.rootCause
			? await this.getCascadingErrors(rootCauseResult.rootCause)
			: [];
		const relatedFixes = await this.getRelatedFixes(errorId);

		return {
			rootCause: rootCauseResult.rootCause,
			path: rootCauseResult.path,
			cascadingErrors: cascadingErrors,
			relatedFixes: relatedFixes
		};
	}

	/**
	 * Get all errors caused by a root cause
	 */
	async getCascadingErrors(rootCauseId: string): Promise<string[]> {
		const query = [
			'MATCH (root:Error {id: $rootCauseId})-[:CAUSES*1..' + this.config.maxDepth + ']->(e:Error)',
			'RETURN DISTINCT e.id as errorId'
		].join('\n');

		const results = await this.executeCypher(query, { rootCauseId });
		return results.map((row: any) => row[0]);
	}

	/**
	 * Get related successful fixes from graph neighbors
	 */
	private async getRelatedFixes(errorId: string): Promise<Array<{ fixId: string; description: string; successRate: number }>> {
		const query = [
			'MATCH (e:Error {id: $errorId})-[:SIMILAR_TO|RELATED_TO*1..2]-(related:Error)-[:FIXED_BY]->(fix:Fix)',
			'WHERE fix.successRate > $minRate',
			'RETURN DISTINCT fix.id as fixId, fix.description as description, fix.successRate as rate',
			'ORDER BY fix.successRate DESC',
			'LIMIT $limit'
		].join('\n');

		const results = await this.executeCypher(query, {
			errorId: errorId,
			minRate: this.config.minSuccessRate,
			limit: this.config.maxRelatedFixes
		});

		return results.map((row: any) => ({
			fixId: row[0],
			description: row[1] || '',
			successRate: row[2] || 0
		}));
	}

	// ========================================================================
	// Strategy Augmentation with Graph Insights
	// ========================================================================

	/**
	 * Augment fix strategies with graph context
	 * Property 12: For any fix strategy, the system SHALL augment it
	 * with graph context (related fixes, success patterns).
	 */
	async augmentStrategies(strategies: FixStrategy[], errorId?: string): Promise<FixStrategy[]> {
		if (!this.available || !errorId) {
			return strategies;
		}

		// Get related successful fixes from graph
		const relatedFixes = await this.getRelatedFixes(errorId);

		if (relatedFixes.length === 0) {
			return strategies;
		}

		// Get error patterns from graph for pattern matching
		const patternQuery = [
			'MATCH (e:Error {id: $errorId})-[:SIMILAR_TO*1..2]-(similar:Error)',
			'RETURN DISTINCT similar.code as code, similar.category as category, count(*) as freq',
			'ORDER BY freq DESC',
			'LIMIT 10'
		].join('\n');

		const patternResults = await this.executeCypher(patternQuery, { errorId });
		const commonPatterns = patternResults.map((row: any) => (row[0] || '') + ':' + (row[1] || ''));

		return strategies.map((strategy: any) => {
			// Check if any graph fix matches this strategy's description
			const graphInsight = relatedFixes.find((f: any) => {
				const fixDesc = (f.description || '').toLowerCase();
				const stratDesc = (strategy.description || '').toLowerCase();
				return stratDesc.includes(fixDesc) || fixDesc.includes(stratDesc);
			});

			// Check pattern overlap
			const hasPatternOverlap = strategy.applicablePatterns.some((p: string) =>
				commonPatterns.some((cp: string) => cp.includes(p) || p.includes(cp))
			);

			if (graphInsight || hasPatternOverlap) {
				this.stats.strategiesAugmented++;

				const boostAmount = graphInsight
					? this.config.confidenceBoost * (graphInsight.successRate || 1.0)
					: this.config.confidenceBoost * 0.5;

				const augmentedPatterns = [...strategy.applicablePatterns];
				if (graphInsight) {
					augmentedPatterns.push('graph:' + graphInsight.fixId);
				}

				return {
					...strategy,
					confidence: Math.min(1.0, strategy.confidence + boostAmount),
					applicablePatterns: augmentedPatterns
				};
			}

			return strategy;
		});
	}

	/**
	 * Get fix success patterns from the graph for a specific error code
	 */
	async getFixPatterns(errorCode: string): Promise<Array<{
		pattern: string;
		successRate: number;
		appliedCount: number;
	}>> {
		const query = [
			'MATCH (e:Error {code: $errorCode})-[:FIXED_BY]->(fix:Fix)',
			'WHERE fix.successRate > 0.5',
			'RETURN fix.description as pattern, fix.successRate as rate, fix.appliedCount as count',
			'ORDER BY fix.successRate DESC, fix.appliedCount DESC',
			'LIMIT 10'
		].join('\n');

		const results = await this.executeCypher(query, { errorCode });

		return results.map((row: any) => ({
			pattern: row[0] || '',
			successRate: row[1] || 0,
			appliedCount: row[2] || 0
		}));
	}

	// ========================================================================
	// Relationship Management (Create, Update, Delete)
	// ========================================================================

	/**
	 * Create a relationship between errors
	 * Property 13: For any identified relationship, the system SHALL
	 * create or update the edge in Neo4j.
	 */
	async createRelationship(relationship: ErrorRelationship): Promise<boolean> {
		const relType = relationship.type.toUpperCase();
		const query = [
			'MERGE (from:Error {id: $from})',
			'MERGE (to:Error {id: $to})',
			'MERGE (from)-[r:' + relType + ']->(to)',
			'SET r.weight = $weight, r.updatedAt = datetime(), r.createdAt = COALESCE(r.createdAt, datetime())',
			'RETURN r'
		].join('\n');

		const results = await this.executeCypher(query, {
			from: relationship.from,
			to: relationship.to,
			weight: relationship.weight
		});

		if (results.length > 0) {
			this.stats.relationshipsCreated++;
			return true;
		}

		return false;
	}

	/**
	 * Update the weight of an existing relationship
	 */
	async updateRelationshipWeight(fromId: string, toId: string, newWeight: number): Promise<boolean> {
		const query = [
			'MATCH (from:Error {id: $from})-[r]->(to:Error {id: $to})',
			'SET r.weight = $weight, r.updatedAt = datetime()',
			'RETURN r'
		].join('\n');

		const results = await this.executeCypher(query, {
			from: fromId,
			to: toId,
			weight: newWeight
		});

		return results.length > 0;
	}

	/**
	 * Delete a relationship between two errors
	 */
	async deleteRelationship(fromId: string, toId: string, relationType?: string): Promise<boolean> {
		let query: string;
		if (relationType) {
			query = [
				'MATCH (from:Error {id: $from})-[r:' + relationType.toUpperCase() + ']->(to:Error {id: $to})',
				'DELETE r',
				'RETURN count(r) as deleted'
			].join('\n');
		} else {
			query = [
				'MATCH (from:Error {id: $from})-[r]->(to:Error {id: $to})',
				'DELETE r',
				'RETURN count(r) as deleted'
			].join('\n');
		}

		const results = await this.executeCypher(query, {
			from: fromId,
			to: toId
		});

		if (results.length > 0 && results[0][0] > 0) {
			this.stats.relationshipsDeleted += results[0][0];
			return true;
		}

		return false;
	}

	/**
	 * Create or update an error node in the graph
	 */
	async upsertErrorNode(error: ErrorReport): Promise<boolean> {
		const query = [
			'MERGE (e:Error {id: $id})',
			'SET e.file = $file, e.line = $line, e.code = $code,',
			'    e.message = $message, e.severity = $severity,',
			'    e.category = $category, e.source = $source,',
			'    e.updatedAt = datetime(),',
			'    e.createdAt = COALESCE(e.createdAt, datetime())',
			'RETURN e'
		].join('\n');

		const errorId = (error as any)?.hash || (error.file + ':' + error.line + ':' + error.code);

		const results = await this.executeCypher(query, {
			id: errorId,
			file: error.file,
			line: error.line,
			code: error.code,
			message: error.message,
			severity: error.severity,
			category: (error as any)?.category ?? 'misc-error',
			source: error.source ?? 'svelte-check'
		});

		return results.length > 0;
	}

	/**
	 * Delete an error node and all its relationships
	 */
	async deleteErrorNode(errorId: string): Promise<boolean> {
		const query = [
			'MATCH (e:Error {id: $errorId})',
			'DETACH DELETE e',
			'RETURN count(e) as deleted'
		].join('\n');

		const results = await this.executeCypher(query, { errorId });
		return results.length > 0 && results[0][0] > 0;
	}

	/**
	 * Link error to fix strategy with outcome tracking
	 */
	async linkErrorToFix(errorId: string, strategyId: string, success: boolean): Promise<boolean> {
		const relType = success ? 'FIXED_BY' : 'ATTEMPTED_FIX';
		const query = [
			'MATCH (e:Error {id: $errorId})',
			'MERGE (f:Fix {id: $strategyId})',
			'MERGE (e)-[r:' + relType + ']->(f)',
			'SET r.timestamp = datetime(), r.success = $success',
			'WITH f',
			'OPTIONAL MATCH (f)<-[all_r:FIXED_BY|ATTEMPTED_FIX]-()',
			'WITH f, count(CASE WHEN all_r.success = true THEN 1 END) as successes, count(all_r) as total',
			'SET f.successRate = CASE WHEN total > 0 THEN toFloat(successes) / total ELSE 0 END,',
			'    f.appliedCount = total',
			'RETURN f'
		].join('\n');

		const results = await this.executeCypher(query, { errorId, strategyId, success });
		return results.length > 0;
	}

	/**
	 * Get fix success rate for an error pattern
	 */
	async getFixSuccessRate(errorId: string): Promise<number> {
		const query = [
			'MATCH (e:Error {id: $errorId})-[r:FIXED_BY|ATTEMPTED_FIX]->(f:Fix)',
			'RETURN',
			'  count(CASE WHEN r.success = true THEN 1 END) as successes,',
			'  count(r) as total'
		].join('\n');

		const results = await this.executeCypher(query, { errorId });

		if (results.length > 0 && results[0][1] > 0) {
			return results[0][0] / results[0][1];
		}

		return 0;
	}

	/**
	 * Bulk import error relationships from analysis results
	 */
	async bulkImportRelationships(relationships: ErrorRelationship[]): Promise<number> {
		let created = 0;
		// Process in batches of 10 to avoid overwhelming Neo4j
		const batchSize = 10;
		for (let i = 0; i < relationships.length; i += batchSize) {
			const batch = relationships.slice(i, i + batchSize);
			const promises = batch.map((rel: any) => this.createRelationship(rel));
			const results = await Promise.all(promises);
			created += results.filter(Boolean).length;
		}
		return created;
	}

	// ========================================================================
	// Utility Methods
	// ========================================================================

	/**
	 * Normalize relationship type to our enum
	 */
	private normalizeRelationType(type: string): 'causes' | 'related_to' | 'fixed_by' | 'similar_to' {
		const normalized = (type || '').toLowerCase();
		if (normalized.includes('cause')) return 'causes';
		if (normalized.includes('fix') || normalized.includes('attempt')) return 'fixed_by';
		if (normalized.includes('similar')) return 'similar_to';
		return 'related_to';
	}

	/**
	 * Get service statistics
	 */
	getStats() {
		return {
			available: this.available,
			config: {
				neo4jUrl: this.config.neo4jUrl,
				maxDepth: this.config.maxDepth,
				confidenceBoost: this.config.confidenceBoost,
				minSuccessRate: this.config.minSuccessRate
			},
			...this.stats
		};
	}

	/**
	 * Check if service is available
	 */
	isAvailable(): boolean {
		return this.available;
	}

	/**
	 * Reset statistics
	 */
	resetStats(): void {
		this.stats = {
			queries: 0,
			rootCausesFound: 0,
			relationshipsCreated: 0,
			relationshipsDeleted: 0,
			graphTraversals: 0,
			strategiesAugmented: 0,
			similarErrorsFound: 0
		};
	}
}

/**
 * Singleton instance
 */
let kagTraverserInstance: KAGTraverser | null = null;

/**
 * Get or create KAGTraverser singleton
 */
export function getKAGTraverser(config?: Partial<KAGConfig>): KAGTraverser {
	if (!kagTraverserInstance) {
		kagTraverserInstance = new KAGTraverser(config);
	}
	return kagTraverserInstance;
}