import { describe, expect, it } from 'vitest';
import {
  traverseCsrWithCursor,
  type BoundedCsrGraph,
  type CsrGraphCursor,
  CsrGraphCursorSchema,
} from './csr-traversal-cursor.js';

describe('traverseCsrWithCursor (FANOUT-CSR-02)', () => {
  // Construct a deterministic test graph:
  // Node 0 -> [1, 2]
  // Node 1 -> [3]
  // Node 2 -> [4]
  // Node 3 -> [5]
  // Node 4 -> [5]
  // Node 5 -> []
  const rowOffsets = new Uint32Array([0, 2, 3, 4, 5, 6, 6]);
  const colIndices = new Uint32Array([1, 2, 3, 4, 5, 5]);

  const testGraph: BoundedCsrGraph = {
    numNodes: 6,
    numEdges: 6,
    rowOffsets,
    colIndices,
    graphRevision: 'sha256:graph_snapshot_v1',
    edgePolicyRevision: 'v1',
  };

  it('performs bounded BFS traversal from seed', () => {
    const result = traverseCsrWithCursor(
      testGraph,
      [0],
      { maxDepth: 1, maxNodesPerStep: 10, edgePolicyRevision: 'v1' }
    );

    expect(result.depthCompleted).toBe(1);
    expect(result.discoveredOrdinals).toEqual([1, 2]);
    expect(result.totalVisited).toBe(3); // 0, 1, 2
    expect(result.isComplete).toBe(true);

    const parseCheck = CsrGraphCursorSchema.safeParse(result.cursor);
    expect(parseCheck.success).toBe(true);
  });

  it('paginates when maxNodesPerStep ceiling is reached', () => {
    // Step 1: Limit to 1 node discovered per step
    const step1 = traverseCsrWithCursor(
      testGraph,
      [0],
      { maxDepth: 2, maxNodesPerStep: 1, edgePolicyRevision: 'v1' }
    );

    expect(step1.discoveredOrdinals).toHaveLength(1);
    expect(step1.isComplete).toBe(false);

    // Verify cursor schema validity
    const parsedCursor = CsrGraphCursorSchema.safeParse(step1.cursor);
    expect(parsedCursor.success).toBe(true);
  });

  it('resumes deterministically without repeating or skipping nodes', () => {
    const options = { maxDepth: 2, maxNodesPerStep: 1, edgePolicyRevision: 'v1' };
    const pages: number[][] = [];
    let cursor: CsrGraphCursor | undefined;
    let result = traverseCsrWithCursor(testGraph, [0], options);
    pages.push(result.discoveredOrdinals);

    while (!result.isComplete) {
      cursor = result.cursor;
      result = traverseCsrWithCursor(testGraph, [0], options, cursor);
      pages.push(result.discoveredOrdinals);
    }

    expect(pages).toEqual([[1], [2], [3], [4]]);
    expect(new Set(pages.flat()).size).toBe(4);
    expect(result.totalVisited).toBe(5);
  });

  it('rejects cursor state changed outside the frozen traversal contract', () => {
    const options = { maxDepth: 2, maxNodesPerStep: 1, edgePolicyRevision: 'v1' };
    const first = traverseCsrWithCursor(testGraph, [0], options);

    expect(() =>
      traverseCsrWithCursor(testGraph, [0], options, {
        ...first.cursor,
        discoveryPrefixChecksum: 'tampered',
      })
    ).toThrow('CSR_CURSOR_STATE_MISMATCH');

    expect(() =>
      traverseCsrWithCursor(testGraph, [0], options, {
        ...first.cursor,
        edgePolicyRevision: 'v2',
      })
    ).toThrow('CSR_CURSOR_EDGE_POLICY_MISMATCH');

    expect(() =>
      traverseCsrWithCursor(
        testGraph,
        [0],
        {
          ...options,
          maxDepth: 3,
        },
        first.cursor
      )
    ).toThrow('CSR_CURSOR_DEPTH_MISMATCH');
  });

  it('rejects invalid seeds and malformed CSR buffers', () => {
    expect(() => traverseCsrWithCursor(testGraph, [6], {
      maxDepth: 1,
      maxNodesPerStep: 1,
      edgePolicyRevision: 'v1',
    })).toThrow('CSR_SEED_ORDINAL_INVALID');

    expect(() => traverseCsrWithCursor({
      ...testGraph,
      rowOffsets: new Uint32Array([0, 3, 2, 4, 5, 6, 6]),
    }, [0], {
      maxDepth: 1,
      maxNodesPerStep: 1,
      edgePolicyRevision: 'v1',
    })).toThrow('CSR_ROW_OFFSETS_NOT_MONOTONIC');
  });

  it('rejects mismatched graph revisions fail-closed', () => {
    const step1 = traverseCsrWithCursor(
      testGraph,
      [0],
      { maxDepth: 1, maxNodesPerStep: 5, edgePolicyRevision: 'v1' }
    );

    const staleCursor = {
      ...step1.cursor,
      graphRevision: 'sha256:stale_graph_revision',
    };

    expect(() =>
      traverseCsrWithCursor(
        testGraph,
        [0],
        { maxDepth: 2, maxNodesPerStep: 5, edgePolicyRevision: 'v1' },
        staleCursor
      )
    ).toThrow('CSR_CURSOR_GRAPH_REVISION_MISMATCH');
  });
});
