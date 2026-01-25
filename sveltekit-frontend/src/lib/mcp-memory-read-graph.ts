/**
 * MCP Memory Read Graph
 * Provides graph-based memory retrieval for MCP (Model Context Protocol) integration
 */

export interface MemoryNode {
    id: string;
    content: string;
    type: 'conversation' | 'document' | 'code' | 'memory';
    timestamp: number;
    connections: string[];
    metadata?: Record<string, unknown>;
}

export interface MemoryGraph {
    nodes: Map<string: MemoryNode>;
    edges: Map<string: Set<string>>;
}

/**
 * Creates a new empty memory graph
 */
export function createMemoryGraph(): MemoryGraph {
    return {
        nodes: new Map(),
        edges: new Map()
    };
}

/**
 * Adds a node to the memory graph
 */
export function addNode(graph: MemoryGraph, node: MemoryNode): void {
    graph.nodes.set(node.id, node);
    if (!graph.edges.has(node.id)) {
        graph.edges.set(node.id, new Set());
    }

    // Add connections
    for (const connId of node.connections) {
        graph.edges.get(node.id)!.add(connId);
        if (!graph.edges.has(connId)) {
            graph.edges.set(connId, new Set());
        }
        graph.edges.get(connId)!.add(node.id);
    }
}

/**
 * Retrieves nodes connected to a given node
 */
export function getConnectedNodes(graph: MemoryGraph, nodeId: string): MemoryNode[] {
    const connections = graph.edges.get(nodeId);
    if (!connections) return [];

    return Array.from(connections)
        .map(id => graph.nodes.get(id))
        .filter((node): node is MemoryNode => node !== undefined);
}

/**
 * Searches nodes by content
 */
export function searchNodes(graph: MemoryGraph, query: string): MemoryNode[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(graph.nodes.values())
        .filter(node => node.content.toLowerCase().includes(lowerQuery));
}

/**
 * Gets recent nodes sorted by timestamp
 */
export function getRecentNodes(graph: MemoryGraph, limit: number = 10): MemoryNode[] {
    return Array.from(graph.nodes.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
}

/**
 * Removes a node from the graph
 */
export function removeNode(graph: MemoryGraph, nodeId: string): boolean {
    if (!graph.nodes.has(nodeId)) return false;

    // Remove from edges
    const connections = graph.edges.get(nodeId);
    if (connections) {
        for (const connId of connections) {
            graph.edges.get(connId)?.delete(nodeId);
        }
    }

    graph.edges.delete(nodeId);
    graph.nodes.delete(nodeId);

    return true;
}

export default {
    createMemoryGraph,
    addNode,
    getConnectedNodes,
    searchNodes,
    getRecentNodes,
    removeNode
};
