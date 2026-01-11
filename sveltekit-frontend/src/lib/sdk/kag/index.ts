/**
 * KAG (Knowledge Augmented Generation) SDK
 *
 * Provides TypeScript interfaces and utilities for:
 * - Knowledge graph traversal
 * - Entity relationships
 * - Graph-based context retrieval
 * - Semantic reasoning
 */

import type { Driver } from 'neo4j-driver';

// ============================================================================
// TYPES
// ============================================================================

export interface KAGEntity {
	id: string; type: string;
	properties: Record<string, unknown>;
	labels: string[];
}

export interface KAGRelationship {
	id: string; type: string;
	source: string; target: string;
	properties: Record<string, unknown>;
}

export interface KAGQuery {
	startEntity: string;
	relationshipTypes?: string[];
	maxDepth?: number;
	limit?: number;
}

export interface KAGSubgraph {
	entities: KAGEntity[]; relationships: KAGRelationship[];
	query: KAGQuery;
}

export interface KAGConfig {
	neo4jUri: string; neo4jUser: string;
	neo4jPassword: string;
}

// ============================================================================
// KAG CLIENT
// ============================================================================

export class KAGClient {
	private config: KAGConfig;
	private driver: Driver | null = null;

	constructor(config: KAGConfig) {
		this.config = config;
	}

	/**
	 * Initialize Neo4j connection
	 */
	async initialize(driver: Driver): Promise<void> {
		this.driver = driver;

		// Verify connection
		await this.driver.verifyConnectivity();
	}

	/**
	 * Query knowledge graph for context
	 */
	async querySubgraph(query: KAGQuery): Promise<KAGSubgraph> {
		if (!this.driver) throw new Error('KAG client not initialized');

		const session = this.driver.session();

		try {
			const cypherQuery = `
				MATCH path = (start)-[r*1..${query.maxDepth || 2}]-(connected)
				WHERE id(start) = $startId
				${query.relationshipTypes?.length ? `AND ALL(rel IN r WHERE type(rel) IN $types)` : ''}
				RETURN path
				LIMIT $limit
			`;

			const result = await session.run(cypherQuery, {
				startId: parseInt(query.startEntity),
				types: query.relationshipTypes || [],
				limit: query.limit || 50
			});

			const entities: KAGEntity[] = [];
			const relationships: KAGRelationship[] = [];
			const seenEntities = new Set<string>();
			const seenRelationships = new Set<string>();

			for (const record of result.records) {
				const path = record.get('path');

				// Extract entities (nodes)
				for (const node of path.segments.flatMap((s: any) => [s.start, s.end])) {
					const id = node.identity.toString();
					if (!seenEntities.has(id)) {
						entities.push({
							id,
							type: node.labels[0] || 'Unknown',
							properties: node.properties,
							labels: node.labels
						});
						seenEntities.add(id);
					}
				}

				// Extract relationships
				for (const segment of path.segments) {
					const id = segment.relationship.identity.toString();
					if (!seenRelationships.has(id)) {
						relationships.push({
							id,
							type: segment.relationship.type,
							source: segment.start.identity.toString(),
							target: segment.end.identity.toString(),
							properties: segment.relationship.properties
						});
						seenRelationships.add(id);
					}
				}
			}

			return {
				entities,
				relationships,
				query
			};
		} finally {
			await session.close();
		}
	}

	/**
	 * Augment prompt with knowledge graph context
	 */
	augmentPrompt(userPrompt: string, subgraph: KAGSubgraph): string {
		const context = this.formatSubgraph(subgraph);

		return `Knowledge Graph Context:\n${context}\n\nUser Question: ${userPrompt}\n\nAnswer:`;
	}

	/**
	 * Format subgraph as human-readable text
	 * @private
	 */
	private formatSubgraph(subgraph: KAGSubgraph): string {
		const lines: string[] = [];

		// Format entities
		lines.push('Entities:');
		for (const entity of subgraph.entities) {
			lines.push(`- [${entity.type}] ${JSON.stringify(entity.properties)}`);
		}

		// Format relationships
		lines.push('\nRelationships:');
		for (const rel of subgraph.relationships) {
			const source = subgraph.entities.find(e => e.id === rel.source);
			const target = subgraph.entities.find(e => e.id === rel.target);
			lines.push(
				`- ${source?.type || 'Unknown'} --[${rel.type}]--> ${target?.type || 'Unknown'}`
			);
		}

		return lines.join('\n');
	}

	/**
	 * Health check
	 */
	async healthCheck(): Promise<boolean> {
		if (!this.driver) return false;

		try {
			await this.driver.verifyConnectivity();
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Cleanup
	 */
	async close(): Promise<void> {
		await this.driver?.close();
	}
}

// ============================================================================
// EXPORTS
// ============================================================================

export default KAGClient;



