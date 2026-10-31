import { describe, expect, it } from 'vitest';
import { buildCartridge, type RuneData } from './chr97-builder.js';
import { parseCartridge } from '$lib/shared/chr97-reader.js';
import {
  traverseCsrWithCursor,
  type BoundedCsrGraph,
} from '../atlas/graph/csr-traversal-cursor.js';

describe('CHR97 Cartridge CSR Graph & BFS Traversal Integration', () => {
  it('builds a CHR97 cartridge, extracts its CSR graph, and executes bounded BFS traversal', () => {
    // 1. Create dummy rune records
    const nodeCount = 5;
    const dummyEmbedding = new Array(768).fill(0.05);
    const runes: RuneData[] = Array.from({ length: nodeCount }, (_, i) => ({
      id: i,
      clusterId: 1,
      embedding: dummyEmbedding,
      text: `Evidence fragment ${i}`,
      sourceId: `doc-${i}`,
      sourceName: `evidence_${i}.pdf`,
    }));

    // 2. Build binary cartridge Buffer
    const cartridgeBuffer = buildCartridge(runes, {
      caseId: 'test-case-csr-001',
      createdAt: new Date().toISOString(),
      runeCount: nodeCount,
      embeddingDim: 768,
      collections: ['evidence_items'],
      sources: ['evidence_0.pdf'],
    });

    expect(cartridgeBuffer.length).toBeGreaterThan(4096);

    // 3. Parse cartridge via shared reader
    const parsed = parseCartridge(new Uint8Array(cartridgeBuffer));
    expect(parsed.header.magic).toBe('CHR97');
    expect(parsed.header.runeCount).toBe(nodeCount);
    expect(parsed.header.graphNodeCount).toBe(nodeCount);
    expect(parsed.graph).toBeDefined();

    const csr = parsed.graph!;
    expect(csr.numNodes).toBe(nodeCount);
    expect(csr.numEdges).toBe(nodeCount);
    expect(csr.rowOffsets.length).toBe(nodeCount + 1);
    expect(csr.colIndices.length).toBe(nodeCount);

    // Circular graph: 0->1, 1->2, 2->3, 3->4, 4->0
    expect(Array.from(csr.rowOffsets)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(Array.from(csr.colIndices)).toEqual([1, 2, 3, 4, 0]);

    // 4. Adapt to BoundedCsrGraph and execute bounded BFS traversal step
    const boundedGraph: BoundedCsrGraph = {
      numNodes: csr.numNodes,
      numEdges: csr.numEdges,
      rowOffsets: csr.rowOffsets,
      colIndices: csr.colIndices,
      graphRevision: 'test-graph-rev-v1',
      edgePolicyRevision: 'circular-neighbor-policy-v1',
    };

    // Step 1: Start BFS from seed node 0 with depth 2
    const step1 = traverseCsrWithCursor(
      boundedGraph,
      [0],
      {
        maxDepth: 2,
        maxNodesPerStep: 10,
        edgePolicyRevision: 'circular-neighbor-policy-v1',
      }
    );

    expect(step1.discoveredOrdinals).toEqual([1, 2]);
    expect(step1.totalVisited).toBe(3); // seed 0 + node 1 + node 2
    expect(step1.isComplete).toBe(true);
    expect(step1.cursor.schema).toBe('atlas.csr-graph-cursor.v1');
    expect(step1.cursor.traversalDepth).toBe(2);

    // Step 2: Full graph traversal depth 5 covers all nodes
    const step2 = traverseCsrWithCursor(
      boundedGraph,
      [0],
      {
        maxDepth: 5,
        maxNodesPerStep: 10,
        edgePolicyRevision: 'circular-neighbor-policy-v1',
      }
    );

    expect(step2.discoveredOrdinals).toEqual([1, 2, 3, 4]);
    expect(step2.totalVisited).toBe(5);
    expect(step2.isComplete).toBe(true);
  });
});
