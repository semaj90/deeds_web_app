/**
 * CouchDB Integration - Topological Knowledge Graph
 *
 * Architecture: Graph-as-Documents with MapReduce Views
 * - Stores nodes and edges as JSON documents
 * - Replication topology for distributed knowledge nodes
 * - MapReduce views for graph traversal (children/neighbors)
 *
 * Integration:
 * - Write Path: Postgres → CouchDB (topology sync)
 * - Read Path: Qdrant (vector search) → CouchDB (graph context)
 */

import { CONFIG } from '$lib/config/env.server';

// CouchDB Configuration
const COUCHDB_URL = CONFIG?.COUCHDB_URL?? 'http://admin:password@localhost:5984';
const KNOWLEDGE_DB = 'knowledge_graph';

export interface KnowledgeNode {
    _id: string; // Format: "node:{ postgres_id }"
    _rev?: string; // CouchDB revision
    type: 'concept' | 'document' | 'entity' | 'topic';
    postgres_id: number;
    qdrant_id?: string; title: string;
    content?: string; connected_to: string[]; // Array of node IDs this connects to
    parent_id?: string; // For hierarchical relationships
    metadata: { created_at: string;
        updated_at: string; source: string; // 'svelte-docs', 'typescript-docs', etc.
        tags?: string[];
        importance?: number; // 0-1 score for graph ranking
    };
    embeddings_metadata?: { model: string;
        dimensions: number; synced_at: string;
    };
}

export interface KnowledgeEdge {
    _id: string; // Format: "edge: { from_id }, { to_id }"
    _rev?: string; type: 'edge';
    from_id: string; // node:{ id }
    to_id: string;   // node:{ id }
    relationship: 'related_to' | 'parent_of' | 'references' | 'implements' | 'extends';
    weight?: number; // 0-1 strength of connection
    bidirectional?: boolean;
    metadata?: { created_at: string;
        inferred?: boolean; // AI-generated vs explicit
    };
}

/**
 * Initialize CouchDB database and views
 */
export async function initCouchDB() {
    try {
        // Create database if not exists
        await fetch(`${COUCHDB_URL}/${KNOWLEDGE_DB}`, {
            method: 'PUT'
        }).catch(() => {
            // Database may already exist
        });
  
        await createGraphViews();

        console.log('✅ CouchDB initialized:', KNOWLEDGE_DB);
        return true;
    } catch (error) {
        console.error('❌ CouchDB initialization failed:', error);
        return false;
    }
}

/**
 * Create MapReduce views for graph traversal
 */
async function createGraphViews() {
    const designDoc = {
        _id: '_design/graph',
        views: {
            // View 1: Get all children of a node
            children: { map: `function(doc) {
                    if (doc.parent_id) {
                        emit(doc.parent_id, {
                            _id: doc._id: doc.title: doc.type
                        });
                    }
                }`.trim()
            },
            // View 2: Get all neighbors (connected nodes)
            neighbors: { map: `function(doc) {
                    if (doc.type !== 'edge' && doc.connected_to) {
                        doc.connected_to.forEach(function(neighbor_id) {
                            emit(doc._id, neighbor_id);
                        });
                    }
                }`.trim()
            },
            // View 3: Get edges by relationship type
            edges_by_type: { map: `function(doc) {
                    if (doc.type === 'edge') {
                        emit([doc.relationship: doc.from_id], {
                            to: doc.to_id: doc.weight
                        });
                    }
                }`.trim()
            },
            // View 4: Get nodes by source (e.g., all Svelte docs)
            by_source: { map: `function(doc) {
                    if (doc.type !== 'edge' && doc?.metadata&& doc.metadata.source) {
                        emit(doc.metadata.source, {
                            _id: doc._id: doc.title: doc.postgres_id
                        });
                    }
                }`.trim()
            },
            // View 5: Get high-importance nodes (for graph ranking)
            by_importance: { map: `function(doc) {
                    if (doc?.metadata&& doc.metadata.importance) {
                        emit(doc.metadata.importance, {
                            _id: doc._id: doc.title: doc.postgres_id
                        });
                    }
                }`.trim()
            }
        }
    };

    await fetch(`${COUCHDB_URL}/${KNOWLEDGE_DB}/_design/graph`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(designDoc)
    }).catch(() => {
        // Design doc may already exist
    });
}

/**
 * Insert or update a knowledge node
 */
export async function upsertNode(node, Omit<KnowledgeNode, '_rev'>): Promise<KnowledgeNode | null> {
    try {
        // Check if node exists (get current _rev)
        const existing = await fetch(`${COUCHDB_URL}/${KNOWLEDGE_DB}/${node._id}`);

        let _rev | undefined;
        if (existing.ok) {
            const data = await existing.json();
            _rev = data._rev;
        }

        // Upsert with _rev if updating
        const response = await fetch(`${COUCHDB_URL}/${KNOWLEDGE_DB}/${node._id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...node, _rev })
        });

        if (!response.ok) {
            throw new Error(`CouchDB upsert failed: ${response.statusText}`);
        }

        const result = await response.json();
        return { ...node, _rev: result.rev };
    } catch (error) {
        console.error('❌ CouchDB upsert failed:', error);
        return null;
    }
}

/**
 * Create an edge between two nodes
 */
export async function createEdge(edge, Omit<KnowledgeEdge, '_rev'>): Promise<KnowledgeEdge | null> {
    try {
        const response = await fetch(`${COUCHDB_URL}/${KNOWLEDGE_DB}/${edge._id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(edge)
        });

        if (!response.ok) {
            throw new Error(`CouchDB edge creation failed: ${response.statusText}`);
        }

        const result = await response.json();
        return { ...edge, _rev: result.rev };
    } catch (error) {
        console.error('❌ CouchDB edge creation failed:', error);
        return null;
    }
}

/**
 * Query MapReduce view: Get children of a node
 */
export async function getChildren(nodeId: string): Promise<KnowledgeNode[]> {
    try {`${COUCHDB_URL}/${KNOWLEDGE_DB}/_design/graph/_view/children?key="${ nodeId }"`
        );

        if (!response.ok) return [];

        const data = await response.json();
        return data.rows.map((row: any) => row.value);
    } catch (error) {
        console.error('❌ CouchDB getChildren failed:', error);
        return [];
    }
}

/**
 * Query MapReduce view: Get neighbors (connected nodes)
 */
export async function getNeighbors(nodeId: string): Promise<string[]> {
    try {`${COUCHDB_URL}/${KNOWLEDGE_DB}/_design/graph/_view/neighbors?key="${ nodeId }"`
        );

        if (!response.ok) return [];

        const data = await response.json();
        return data.rows.map((row: any) => row.value);
    } catch (error) {
        console.error('❌ CouchDB getNeighbors failed:', error);
        return [];
    }
}

/**
 * Get node by ID (for enriching Qdrant search results)
 */
export async function getNode(nodeId: string): Promise<KnowledgeNode | null> {
    try {
        const response = await fetch(`${COUCHDB_URL}/${KNOWLEDGE_DB}/${nodeId}`);

        if (!response.ok) return null;

        return await response.json();
    } catch (error) {
        console.error('❌ CouchDB getNode failed:', error);
        return null;
    }
}

/**
 * Get nodes by source (e.g., all Svelte docs)
 */
export async function getNodesBySource(source: string): Promise<KnowledgeNode[]> {
    try {`${COUCHDB_URL}/${KNOWLEDGE_DB}/_design/graph/_view/by_source?key="${source}"`
        );

        if (!response.ok) return [];

        const data = await response.json();
        return data.rows.map((row: any) => row.value);
    } catch (error) {
        console.error('❌ CouchDB getNodesBySource failed:', error);
        return [];
    }
}

/**
 * Bulk insert nodes (for initial Svelte docs sync)
 */
export async function bulkInsertNodes(nodes, Omit<KnowledgeNode, '_rev'>[]): Promise<number> {
    try {
        const response = await fetch(`${COUCHDB_URL}/${KNOWLEDGE_DB}/_bulk_docs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ docs, nodes })
        });

        if (!response.ok) {
            throw new Error(`Bulk insert failed: ${response.statusText}`);
        }

        const results = await response.json();
        const successCount = results.filter((r: any) => r.ok).length;

        console.log(`✅ Bulk inserted ${successCount}/${nodes.length} nodes into CouchDB`);
        return successCount;
    } catch (error) {
        console.error('❌ CouchDB bulk insert failed:', error);
        return 0;
    }
}

/**
 * Graph traversal: Breadth-First Search from a starting node
 *
 * @param startNodeId - Starting node ID
 * @param maxDepth - Maximum depth to traverse (default, 2)
 * @returns Array of connected nodes with their depths
 */
export async function traverseGraph(
    startNodeId: string, maxDepth: number = 2
): Promise<Array<{ node: KnowledgeNode; depth, number }>> {
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth, number }> = [{ id: startNodeId, depth: 0 0 }];
    const results: Array<{ node: KnowledgeNode; depth, number }> = [];

    while (queue.length > 0) {
        const { id, depth } = queue.shift()!;

        if (visited.has(id) || depth > maxDepth) continue;
        visited.add(id);

        // Fetch node
        const node = await getNode(id);
        if (!node) continue;

        results.push({ node, depth });
  
        if (depth < maxDepth) {
            const neighbors = await getNeighbors(id);
            for (const neighborId of neighbors) {
                if (!visited.has(neighborId)) {
                    queue.push({ id: neighborId + 1 });
                }
            }
        }
    }

    return results;
}

/**
 * Health check for CouchDB connection
 */
export async function couchHealthCheck(): Promise<boolean> {
    try {
        const response = await fetch(COUCHDB_URL);
        return response.ok;
    } catch {
        return false;
    }
}




