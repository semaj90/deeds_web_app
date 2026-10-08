import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  atlasCoverageInputSchema,
  atlasContextInputSchema,
  atlasGetChunkInputSchema,
  traceSearchInputSchema,
  atlasGraphPageRankInputSchema,
  atlasPacketDenseSearchAdvertisedSchema,
  atlasPacketDenseSearchInputSchema,
  atlasPacketSearchInputSchema,
  featureDocumentReadInputSchema,
  FEATURE_DOCUMENT_READ_STATEMENT_TIMEOUT_MS,
  FEATURE_DOCUMENT_MANIFEST_MAX_BYTES,
  FEATURE_DOCUMENT_DIRECTORY_MAX_ENTRIES,
  featureEvidenceTuplesInputSchema,
  FEATURE_DOCUMENT_ID_MAX_CHARS,
  FEATURE_EVIDENCE_TUPLES_MAX,
  graphAnalysisNeighborhoodInputSchema,
  graphCommunityForNodeInputSchema,
  graphExpandNeighborhoodInputSchema,
  graphPageRankTopInputSchema,
  graphSemanticPathInputSchema,
  graphShortestPathInputSchema,
  buildGraphNeighborhoodFailureV1,
  GRAPH_EXPAND_ERROR_MAX_CHARS,
  turbovecRankChunksInputSchema,
  engramMemoryRecentInputSchema,
  ENGRAM_MEMORY_MAX_SOURCE_REFS,
  ENGRAM_MEMORY_SOURCE_REF_MAX_CHARS,
  ENGRAM_MEMORY_USER_ID_MAX_CHARS,
  knowledgeMinifiedMapInputSchema,
  KNOWLEDGE_MAP_DIRECTORY_MAX_CHARS,
  KNOWLEDGE_MAP_MAX_EDGES,
  KNOWLEDGE_MAP_MAX_AGENTS,
  hypergraphSearchInputSchema,
  clusterMembersInputSchema,
  CLUSTER_MEMBERS_KEY_MAX_CHARS,
  CLUSTER_MEMBERS_MAX_LIMIT,
  codebaseRgSearchInputSchema,
  buildCodebaseRgSearchArgsV1,
  truncateUtf8TextV1,
  CODEBASE_RG_QUERY_MAX_CHARS,
  CODEBASE_RG_INCLUDE_MAX_CHARS,
  CODEBASE_RG_MAX_CONTEXT_LINES,
  CODEBASE_RG_MAX_OUTPUT_BYTES,
  postgresFtsSearchInputSchema,
  POSTGRES_FTS_QUERY_MAX_CHARS,
  POSTGRES_FTS_TOPO_CLASS_MAX_CHARS,
  POSTGRES_FTS_MAX_RESULTS,
  POSTGRES_FTS_STATEMENT_TIMEOUT_MS,
  traceExplainRetrievalInputSchema,
  TRACE_EXPLAIN_QUERY_MAX_CHARS,
  TRACE_EXPLAIN_SCAN_MAX_PAGES,
  TRACE_EXPLAIN_SCAN_PAGE_SIZE,
  TRACE_EXPLAIN_MAX_SCANNED_KEYS,
  TRACE_EXPLAIN_MAX_KEYS,
  TRACE_EXPLAIN_MAX_VALUE_BYTES,
  TRACE_EXPLAIN_COMMAND_TIMEOUT_MS,
  TRACE_EXPLAIN_TOTAL_TIMEOUT_MS,
  selectTraceScanKeysV1,
  traceValueMatchesQueryV1,
  notecardSearchInputSchema,
  NOTECARD_SEARCH_QUERY_MAX_CHARS,
  NOTECARD_SEARCH_MAX_RESULTS,
  HYPERGRAPH_SEARCH_QUERY_MAX_CHARS,
  HYPERGRAPH_SEARCH_EDGE_TYPE_MAX_ITEMS,
  HYPERGRAPH_SEARCH_EDGE_TYPE_MAX_CHARS,
  HYPERGRAPH_SEARCH_MAX_RESULTS,
  TURBOVEC_RANK_MAX_REFS,
  TURBOVEC_RANK_MAX_SCORE_MAP_ENTRIES,
  TURBOVEC_RANK_QUERY_MAX_CHARS,
  TURBOVEC_RANK_SOURCE_REF_MAX_CHARS,
  GRAPH_ANALYSIS_PATH_MAX_CHARS,
  GRAPH_SHORTEST_PATH_MAX_HOPS,
  GRAPH_EXPAND_NEIGHBORHOOD_MAX_SEEDS,
  GRAPH_EXPAND_REF_MAX_CHARS,
  GRAPH_EXPAND_TEXT_MAX_CHARS,
  GRAPH_PAGERANK_NODE_TYPE_MAX_CHARS,
  MCP_READ_MAX_OUTPUT_BYTES,
  MCP_UPSTREAM_JSON_MAX_BYTES,
  readBoundedJsonResponse,
  PACKET_SEARCH_FILTER_MAX_CHARS,
  PACKET_SEARCH_TEXT_MAX_CHARS,
  PACKET_DENSE_MAX_TAGS,
  PACKET_DENSE_VECTOR_DIMENSIONS,
  ATLAS_GRAPH_PAGERANK_MAX_OFFSET,
  ATLAS_CONTEXT_QUERY_MAX_CHARS,
  ATLAS_CONTEXT_PATH_MAX_CHARS,
  ATLAS_CONTEXT_CHUNK_ID_MAX_CHARS,
  ATLAS_CONTEXT_SOURCE_REF_MAX_CHARS,
  TRACE_SEARCH_QUERY_MAX_CHARS,
  TRACE_SEARCH_INTENT_MAX_ITEMS,
  TRACE_SEARCH_INTENT_MAX_CHARS,
  serializeBoundedReadResult,
} from './read-tool-bounds.js';

describe('ORF-7 read-tool input bounds', () => {
  it('bounds ripgrep inputs and builds a shell-free argument vector', () => {
    const input = codebaseRgSearchInputSchema.parse({
      query: '  pattern with spaces  ',
      include: 'src/**/*.ts',
    });
    expect(input).toEqual({ query: 'pattern with spaces', include: 'src/**/*.ts', contextLines: 2 });
    expect(buildCodebaseRgSearchArgsV1(input)).toEqual([
      '--max-columns', '200', '--context', '2', '--glob', 'src/**/*.ts',
      '--', 'pattern with spaces', '.',
    ]);
    expect(buildCodebaseRgSearchArgsV1(codebaseRgSearchInputSchema.parse({ query: '  foo; & $()  ' })))
      .toEqual(['--max-columns', '200', '--context', '2', '--', 'foo; & $()', '.']);
    expect(codebaseRgSearchInputSchema.safeParse({ query: ' ' }).success).toBe(false);
    expect(codebaseRgSearchInputSchema.safeParse({ query: 'q'.repeat(CODEBASE_RG_QUERY_MAX_CHARS + 1) }).success).toBe(false);
    expect(codebaseRgSearchInputSchema.safeParse({ query: 'q', include: 'g'.repeat(CODEBASE_RG_INCLUDE_MAX_CHARS + 1) }).success).toBe(false);
    expect(codebaseRgSearchInputSchema.safeParse({ query: 'q', contextLines: CODEBASE_RG_MAX_CONTEXT_LINES + 1 }).success).toBe(false);
    expect(codebaseRgSearchInputSchema.safeParse({ query: 'q', contextLines: -1 }).success).toBe(false);
  });

  it('truncates ripgrep output on UTF-8 boundaries within the byte ceiling', () => {
    expect(truncateUtf8TextV1('A😀B', 5)).toBe('A😀');
    expect(new TextEncoder().encode(truncateUtf8TextV1('x'.repeat(CODEBASE_RG_MAX_OUTPUT_BYTES + 10), CODEBASE_RG_MAX_OUTPUT_BYTES)).byteLength)
      .toBe(CODEBASE_RG_MAX_OUTPUT_BYTES);
    expect(() => truncateUtf8TextV1('x', -1)).toThrow(RangeError);
  });

  it('bounds the read-only PostgreSQL FTS request without changing its lane semantics', () => {
    expect(postgresFtsSearchInputSchema.parse({ query: '  camelCase.symbol  ', topo_class: 'ui' })).toEqual({
      query: 'camelCase.symbol',
      limit: 20,
      topo_class: 'ui',
    });
    expect(postgresFtsSearchInputSchema.safeParse({ query: ' ' }).success).toBe(false);
    expect(postgresFtsSearchInputSchema.safeParse({ query: 'q'.repeat(POSTGRES_FTS_QUERY_MAX_CHARS + 1) }).success).toBe(false);
    expect(postgresFtsSearchInputSchema.safeParse({ query: 'q', limit: POSTGRES_FTS_MAX_RESULTS + 1 }).success).toBe(false);
    expect(postgresFtsSearchInputSchema.safeParse({ query: 'q', topo_class: 'x'.repeat(POSTGRES_FTS_TOPO_CLASS_MAX_CHARS + 1) }).success).toBe(false);
    expect(POSTGRES_FTS_STATEMENT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(POSTGRES_FTS_STATEMENT_TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });

  it('bounds Redis retrieval-trace scans and query matching without using KEYS semantics', () => {
    expect(traceExplainRetrievalInputSchema.parse({ query: '  Qdrant graph  ' })).toEqual({ query: 'Qdrant graph' });
    expect(traceExplainRetrievalInputSchema.safeParse({ query: ' ' }).success).toBe(false);
    expect(traceExplainRetrievalInputSchema.safeParse({ query: 'q'.repeat(TRACE_EXPLAIN_QUERY_MAX_CHARS + 1) }).success).toBe(false);
    expect(selectTraceScanKeysV1(['ace:trace:b', 'ace:trace:a', 'ace:trace:a'])).toEqual([
      'ace:trace:a', 'ace:trace:b',
    ]);
    expect(selectTraceScanKeysV1(Array.from({ length: TRACE_EXPLAIN_MAX_KEYS + 3 }, (_, i) => `ace:trace:${i}`)))
      .toHaveLength(TRACE_EXPLAIN_MAX_KEYS);
    expect(TRACE_EXPLAIN_MAX_SCANNED_KEYS).toBe(TRACE_EXPLAIN_SCAN_MAX_PAGES * TRACE_EXPLAIN_SCAN_PAGE_SIZE);
    expect(traceValueMatchesQueryV1('{"query":"Qdrant graph"}', 'qdrant graph')).toBe(true);
    expect(traceValueMatchesQueryV1('{"query":"different"}', 'qdrant graph')).toBe(false);
    expect(TRACE_EXPLAIN_SCAN_MAX_PAGES).toBe(10);
    expect(TRACE_EXPLAIN_SCAN_PAGE_SIZE).toBe(50);
    expect(TRACE_EXPLAIN_MAX_VALUE_BYTES).toBe(64 * 1024);
    expect(TRACE_EXPLAIN_COMMAND_TIMEOUT_MS).toBeLessThanOrEqual(5000);
    expect(TRACE_EXPLAIN_TOTAL_TIMEOUT_MS).toBe(8000);
  });

  it('bounds local notecard search input without changing its retrieval lane', () => {
    expect(notecardSearchInputSchema.parse({ query: '  AST nodes  ' })).toEqual({ query: 'AST nodes', limit: 5 });
    expect(notecardSearchInputSchema.safeParse({ query: ' ' }).success).toBe(false);
    expect(notecardSearchInputSchema.safeParse({ query: 'q'.repeat(NOTECARD_SEARCH_QUERY_MAX_CHARS + 1) }).success).toBe(false);
    expect(notecardSearchInputSchema.safeParse({ query: 'q', limit: NOTECARD_SEARCH_MAX_RESULTS + 1 }).success).toBe(false);
    expect(notecardSearchInputSchema.safeParse({ query: 'q', limit: 0 }).success).toBe(false);
  });

  it('bounds cluster member lookup keys and result count', () => {
    expect(clusterMembersInputSchema.parse({ clusterKey: '  gpu:998  ' })).toEqual({
      clusterKey: 'gpu:998',
      limit: 50,
    });
    expect(clusterMembersInputSchema.safeParse({ clusterKey: ' ' }).success).toBe(false);
    expect(clusterMembersInputSchema.safeParse({ clusterKey: 'k'.repeat(CLUSTER_MEMBERS_KEY_MAX_CHARS + 1) }).success).toBe(false);
    expect(clusterMembersInputSchema.safeParse({ clusterKey: 'gpu:998', limit: CLUSTER_MEMBERS_MAX_LIMIT + 1 }).success).toBe(false);
    expect(clusterMembersInputSchema.safeParse({ clusterKey: 'gpu:998', limit: 0 }).success).toBe(false);
  });

  it('bounds hypergraph search query, filter fanout, and result count', () => {
    expect(hypergraphSearchInputSchema.parse({ query: '  relation  ', limit: 10 }).query).toBe('relation');
    expect(hypergraphSearchInputSchema.safeParse({ query: ' ' }).success).toBe(false);
    expect(hypergraphSearchInputSchema.safeParse({ query: 'q'.repeat(HYPERGRAPH_SEARCH_QUERY_MAX_CHARS + 1) }).success).toBe(false);
    expect(hypergraphSearchInputSchema.safeParse({ query: 'q', limit: HYPERGRAPH_SEARCH_MAX_RESULTS + 1 }).success).toBe(false);
    expect(hypergraphSearchInputSchema.safeParse({
      query: 'q',
      edge_types: Array.from({ length: HYPERGRAPH_SEARCH_EDGE_TYPE_MAX_ITEMS + 1 }, () => 'code'),
    }).success).toBe(false);
    expect(hypergraphSearchInputSchema.safeParse({ query: 'q', edge_types: ['x'.repeat(HYPERGRAPH_SEARCH_EDGE_TYPE_MAX_CHARS + 1)] }).success).toBe(false);
  });

  it('bounds the read-only minified knowledge map request', () => {
    expect(knowledgeMinifiedMapInputSchema.parse({ directory: 'src', max_edges: 5, max_agents: 3 }))
      .toEqual({ directory: 'src', max_edges: 5, max_agents: 3 });
    expect(knowledgeMinifiedMapInputSchema.safeParse({ directory: 'd'.repeat(KNOWLEDGE_MAP_DIRECTORY_MAX_CHARS + 1) }).success).toBe(false);
    expect(knowledgeMinifiedMapInputSchema.safeParse({ max_edges: KNOWLEDGE_MAP_MAX_EDGES + 1 }).success).toBe(false);
    expect(knowledgeMinifiedMapInputSchema.safeParse({ max_agents: KNOWLEDGE_MAP_MAX_AGENTS + 1 }).success).toBe(false);
    expect(knowledgeMinifiedMapInputSchema.safeParse({ max_edges: 0 }).success).toBe(false);
  });

  it('reads upstream JSON with declared and streaming byte limits', async () => {
    await expect(readBoundedJsonResponse(new Response('{"ok":true}'))).resolves.toEqual({ ok: true });
    await expect(readBoundedJsonResponse(
      new Response('{"large":"payload"}', { headers: { 'content-length': String(MCP_UPSTREAM_JSON_MAX_BYTES + 1) } }),
    )).rejects.toThrow('MCP_UPSTREAM_RESPONSE_LIMIT_EXCEEDED');

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"x":"' + 'a'.repeat(32) + '"}'));
        controller.close();
      },
    });
    await expect(readBoundedJsonResponse(new Response(stream), 16))
      .rejects.toThrow('MCP_UPSTREAM_RESPONSE_LIMIT_EXCEEDED');
    await expect(readBoundedJsonResponse(new Response('{invalid json}'))).rejects.toThrow();
    await expect(readBoundedJsonResponse(new Response('{}'), 0)).rejects.toThrow(RangeError);
  });

  it('bounds shared KAG/Atlas search inputs without changing the result limit', () => {
    expect(traceSearchInputSchema.parse({ query: '  qdrant  ' }).query).toBe('qdrant');
    expect(traceSearchInputSchema.parse({ query: 'q', limit: 20 }).limit).toBe(20);
    expect(traceSearchInputSchema.safeParse({ query: ' ' }).success).toBe(false);
    expect(traceSearchInputSchema.safeParse({ query: 'q'.repeat(TRACE_SEARCH_QUERY_MAX_CHARS + 1) }).success).toBe(false);
    expect(traceSearchInputSchema.safeParse({
      query: 'search',
      intent: Array.from({ length: TRACE_SEARCH_INTENT_MAX_ITEMS + 1 }, () => 'risk'),
    }).success).toBe(false);
    expect(traceSearchInputSchema.safeParse({ query: 'search', intent: ['i'.repeat(TRACE_SEARCH_INTENT_MAX_CHARS + 1)] }).success).toBe(false);
  });

  it('bounds the shared compact-context and chunk request surfaces', () => {
    expect(atlasContextInputSchema.parse({ query: '  lookup ' }).query).toBe('lookup');
    expect(atlasContextInputSchema.safeParse({ query: '  ' }).success).toBe(false);
    expect(atlasContextInputSchema.safeParse({ query: 'q'.repeat(ATLAS_CONTEXT_QUERY_MAX_CHARS + 1) }).success).toBe(false);
    expect(atlasContextInputSchema.safeParse({ query: 'q', path: 'p'.repeat(ATLAS_CONTEXT_PATH_MAX_CHARS + 1) }).success).toBe(false);
    expect(atlasGetChunkInputSchema.parse({ query: 'lookup', chunkId: '  c1  ' }).chunkId).toBe('c1');
    expect(atlasGetChunkInputSchema.safeParse({ query: 'lookup', chunkId: 'c'.repeat(ATLAS_CONTEXT_CHUNK_ID_MAX_CHARS + 1) }).success).toBe(false);
    expect(atlasGetChunkInputSchema.safeParse({ query: 'lookup', sourceRef: 's'.repeat(ATLAS_CONTEXT_SOURCE_REF_MAX_CHARS + 1) }).success).toBe(false);
  });

  it('keeps coverage input strict and defaults to the compact read-only response', () => {
    expect(atlasCoverageInputSchema.parse({})).toEqual({ verbose: false });
    expect(atlasCoverageInputSchema.parse({ verbose: true }).verbose).toBe(true);
    expect(atlasCoverageInputSchema.safeParse({ verbose: 'yes' }).success).toBe(false);
  });

  it('caps PageRank pagination while preserving existing result-count bounds', () => {
    expect(atlasGraphPageRankInputSchema.parse({})).toEqual({ limit: 100, offset: 0 });
    expect(atlasGraphPageRankInputSchema.parse({ limit: 1000, offset: ATLAS_GRAPH_PAGERANK_MAX_OFFSET }).limit).toBe(1000);
    expect(atlasGraphPageRankInputSchema.safeParse({ offset: ATLAS_GRAPH_PAGERANK_MAX_OFFSET + 1 }).success).toBe(false);
    expect(atlasGraphPageRankInputSchema.safeParse({ offset: -1 }).success).toBe(false);
    expect(atlasGraphPageRankInputSchema.safeParse({ limit: 1001 }).success).toBe(false);
  });

  it('accepts existing bounded graph request shapes and rejects seed fanout above the cap', () => {
    expect(graphExpandNeighborhoodInputSchema.parse({
      sourceRefs: ['file:src/a.ts', 'file:src/b.ts'],
      maxHops: 2,
      limit: 40,
    }).sourceRefs).toHaveLength(2);

    expect(graphExpandNeighborhoodInputSchema.safeParse({
      sourceRefs: Array.from({ length: GRAPH_EXPAND_NEIGHBORHOOD_MAX_SEEDS + 1 }, (_, i) => `file:${i}`),
    }).success).toBe(false);
  });

  it('rejects oversized graph identifiers and descriptive text', () => {
    expect(graphExpandNeighborhoodInputSchema.safeParse({ sourceRefs: ['x'.repeat(GRAPH_EXPAND_REF_MAX_CHARS + 1)] }).success).toBe(false);
    expect(graphExpandNeighborhoodInputSchema.safeParse({ query: 'x'.repeat(GRAPH_EXPAND_TEXT_MAX_CHARS + 1) }).success).toBe(false);
    expect(graphExpandNeighborhoodInputSchema.safeParse({ filePath: 'x'.repeat(GRAPH_EXPAND_REF_MAX_CHARS + 1) }).success).toBe(false);
  });

  it('bounds the separate FastMCP graph tools without changing their route vocabulary', () => {
    expect(graphAnalysisNeighborhoodInputSchema.parse({ path: 'src/a.ts', hops: 3, limit: 100 }).path).toBe('src/a.ts');
    expect(graphAnalysisNeighborhoodInputSchema.safeParse({ path: 'x'.repeat(GRAPH_ANALYSIS_PATH_MAX_CHARS + 1) }).success).toBe(false);
    expect(graphAnalysisNeighborhoodInputSchema.safeParse({ path: 'src/a.ts', hops: 4 }).success).toBe(false);

    expect(graphShortestPathInputSchema.parse({ fromKey: 'src/a.ts', toKey: 'src/b.ts', maxHops: GRAPH_SHORTEST_PATH_MAX_HOPS }).maxHops)
      .toBe(GRAPH_SHORTEST_PATH_MAX_HOPS);
    expect(graphShortestPathInputSchema.parse({ fromKey: 'src/a.ts', toKey: 'src/b.ts' }).maxHops).toBe(6);
    expect(graphShortestPathInputSchema.safeParse({ fromKey: 'x'.repeat(GRAPH_ANALYSIS_PATH_MAX_CHARS + 1), toKey: 'src/b.ts' }).success)
      .toBe(false);
    expect(graphShortestPathInputSchema.safeParse({ fromKey: 'src/a.ts', toKey: 'src/b.ts', maxHops: GRAPH_SHORTEST_PATH_MAX_HOPS + 1 }).success)
      .toBe(false);

    expect(graphSemanticPathInputSchema.parse({ startKey: 'src/a.ts', endKey: 'src/b.ts' }).maxHops).toBe(6);
    expect(graphSemanticPathInputSchema.safeParse({ startKey: 'x'.repeat(GRAPH_ANALYSIS_PATH_MAX_CHARS + 1), endKey: 'src/b.ts' }).success)
      .toBe(false);
    expect(graphSemanticPathInputSchema.safeParse({ startKey: 'src/a.ts', endKey: 'src/b.ts', maxHops: GRAPH_SHORTEST_PATH_MAX_HOPS + 1 }).success)
      .toBe(false);
  });

  it('returns stable bounded graph-neighborhood failure data for the direct-driver fallback', () => {
    const result = buildGraphNeighborhoodFailureV1(
      new Error('e'.repeat(GRAPH_EXPAND_ERROR_MAX_CHARS + 40)),
      'file:src/example.ts',
      2,
    );

    expect(Object.keys(result)).toEqual([
      'ok', 'nodes', 'edges', 'sourceRefs', 'confidence', 'graphPaths',
      'maxHops', 'center', 'seedEnvelope', 'graph', 'neighbors', 'error',
    ]);
    expect(result.ok).toBe(false);
    expect(result.graph).toEqual({ nodes: [], edges: [] });
    expect(result.error).toHaveLength(GRAPH_EXPAND_ERROR_MAX_CHARS);
    expect(JSON.parse(serializeBoundedReadResult(result))).toMatchObject({
      ok: false,
      center: 'file:src/example.ts',
      maxHops: 2,
      error: 'e'.repeat(GRAPH_EXPAND_ERROR_MAX_CHARS),
    });
  });

  it('bounds deterministic TurboVec ranking inputs without changing the score contract', () => {
    const parsed = turbovecRankChunksInputSchema.parse({
      query: '  qdrant retrieval  ',
      sourceRefs: [' src/a.ts '],
      vectorScores: { 'src/a.ts': 0.7 },
    });
    expect(parsed.query).toBe('qdrant retrieval');
    expect(parsed.sourceRefs).toEqual(['src/a.ts']);
    expect(parsed.vectorScores).toEqual({ 'src/a.ts': 0.7 });
    expect(turbovecRankChunksInputSchema.safeParse({ query: '  ', sourceRefs: ['src/a.ts'] }).success).toBe(false);
    expect(turbovecRankChunksInputSchema.safeParse({
      query: 'q'.repeat(TURBOVEC_RANK_QUERY_MAX_CHARS + 1),
      sourceRefs: ['src/a.ts'],
    }).success).toBe(false);
    expect(turbovecRankChunksInputSchema.safeParse({
      query: 'q',
      sourceRefs: Array.from({ length: TURBOVEC_RANK_MAX_REFS + 1 }, (_, index) => `src/${index}.ts`),
    }).success).toBe(false);
    expect(turbovecRankChunksInputSchema.safeParse({
      query: 'q',
      sourceRefs: ['r'.repeat(TURBOVEC_RANK_SOURCE_REF_MAX_CHARS + 1)],
    }).success).toBe(false);
    expect(turbovecRankChunksInputSchema.safeParse({
      query: 'q',
      sourceRefs: ['src/a.ts'],
      vectorScores: Object.fromEntries(
        Array.from({ length: TURBOVEC_RANK_MAX_SCORE_MAP_ENTRIES + 1 }, (_, index) => [`src/${index}.ts`, 0.5])
      ),
    }).success).toBe(false);
  });

  it('bounds recent-memory filters and rejects blank supplied user identity', () => {
    expect(engramMemoryRecentInputSchema.parse({ userId: ' user-1 ', sourceRefs: [' src/a.ts '] })).toMatchObject({
      userId: 'user-1',
      sourceRefs: ['src/a.ts'],
    });
    expect(engramMemoryRecentInputSchema.parse({}).limit).toBe(8);
    expect(engramMemoryRecentInputSchema.safeParse({ userId: '   ' }).success).toBe(false);
    expect(engramMemoryRecentInputSchema.safeParse({ userId: 'u'.repeat(ENGRAM_MEMORY_USER_ID_MAX_CHARS + 1) }).success).toBe(false);
    expect(engramMemoryRecentInputSchema.safeParse({ sourceRefs: [' '] }).success).toBe(false);
    expect(engramMemoryRecentInputSchema.safeParse({
      sourceRefs: ['r'.repeat(ENGRAM_MEMORY_SOURCE_REF_MAX_CHARS + 1)],
    }).success).toBe(false);
    expect(engramMemoryRecentInputSchema.safeParse({
      sourceRefs: Array.from({ length: ENGRAM_MEMORY_MAX_SOURCE_REFS + 1 }, (_, index) => `src/${index}.ts`),
    }).success).toBe(false);
  });

  it('bounds and trims graph community lookup identifiers', () => {
    expect(graphCommunityForNodeInputSchema.parse({ stableKey: ' src/example.ts ' })).toEqual({
      stableKey: 'src/example.ts',
    });
    expect(graphCommunityForNodeInputSchema.safeParse({ stableKey: '   ' }).success).toBe(false);
    expect(graphCommunityForNodeInputSchema.safeParse({ stableKey: 'x'.repeat(GRAPH_EXPAND_REF_MAX_CHARS + 1) }).success)
      .toBe(false);
  });

  it('bounds PageRank top reads and rejects unsafe Neo4j label syntax', () => {
    expect(graphPageRankTopInputSchema.parse({})).toEqual({ limit: 20 });
    expect(graphPageRankTopInputSchema.parse({ limit: 50, nodeType: 'CodebaseFile' })).toEqual({
      limit: 50,
      nodeType: 'CodebaseFile',
    });
    expect(graphPageRankTopInputSchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(graphPageRankTopInputSchema.parse({ nodeType: ' CodebaseFile ' }).nodeType).toBe('CodebaseFile');
    expect(graphPageRankTopInputSchema.safeParse({ nodeType: 'CodebaseFile) MATCH (n) //' }).success).toBe(false);
    expect(graphPageRankTopInputSchema.safeParse({ nodeType: 'x'.repeat(GRAPH_PAGERANK_NODE_TYPE_MAX_CHARS + 1) }).success)
      .toBe(false);
  });

  it('accepts bounded packet filters and rejects overlong search inputs', () => {
    expect(atlasPacketSearchInputSchema.parse({
      source_ref: 'src/lib/server/example.ts',
      feature_id: 'feature-a',
      concept_id: 'concept-a',
      summary_query: 'bounded search',
      limit: 20,
    }).limit).toBe(20);

    expect(atlasPacketSearchInputSchema.safeParse({ source_ref: 'x'.repeat(PACKET_SEARCH_FILTER_MAX_CHARS + 1) }).success).toBe(false);
    expect(atlasPacketSearchInputSchema.safeParse({ summary_query: 'x'.repeat(PACKET_SEARCH_TEXT_MAX_CHARS + 1) }).success).toBe(false);
    expect(atlasPacketSearchInputSchema.safeParse({ feature_id: 'x'.repeat(257) }).success).toBe(false);
  });

  it('requires a non-empty packet filter so bounded LIMIT cannot trigger an unfiltered table scan', () => {
    expect(atlasPacketSearchInputSchema.safeParse({}).success).toBe(false);
    expect(atlasPacketSearchInputSchema.safeParse({ summary_query: '   ' }).success).toBe(false);
    expect(atlasPacketSearchInputSchema.safeParse({ feature_id: '' }).success).toBe(false);
    expect(atlasPacketSearchInputSchema.parse({ feature_id: '  feature-a  ' }).feature_id).toBe('feature-a');
  });

  it('bounds dense packet search filters, query payloads, and requires a selective filter plus one 768-d query form', () => {
    const valid = atlasPacketDenseSearchInputSchema.parse({
      feature_id: 'feature-a',
      collection: 'codebase_chunks_768',
      query_vector: Array(PACKET_DENSE_VECTOR_DIMENSIONS).fill(0),
    });
    expect(valid.candidate_cap).toBe(500);

    expect(atlasPacketDenseSearchInputSchema.safeParse({
      collection: 'codebase_chunks_768', query_text: 'query',
    }).success).toBe(false);
    expect(atlasPacketDenseSearchInputSchema.safeParse({
      feature_id: 'feature-a', collection: 'codebase_chunks_768',
    }).success).toBe(false);
    expect(atlasPacketDenseSearchInputSchema.safeParse({
      feature_id: 'feature-a', collection: 'codebase_chunks_768', query_text: 'q',
      query_vector: Array(PACKET_DENSE_VECTOR_DIMENSIONS).fill(0),
    }).success).toBe(false);
    expect(atlasPacketDenseSearchInputSchema.safeParse({
      feature_id: 'feature-a', collection: 'codebase_chunks_768', query_vector: [0, 1],
    }).success).toBe(false);
    expect(atlasPacketDenseSearchInputSchema.safeParse({
      feature_id: 'feature-a', collection: 'codebase_chunks_768', query_text: '   ',
    }).success).toBe(false);
    expect(atlasPacketDenseSearchInputSchema.safeParse({
      tags: Array.from({ length: PACKET_DENSE_MAX_TAGS + 1 }, (_, i) => `tag-${i}`),
      collection: 'codebase_chunks_768', query_text: 'query',
    }).success).toBe(false);
  });

  it('routes DOCS dense requests through a separate bounded contract', () => {
    const valid = atlasPacketDenseSearchInputSchema.parse({
      scope: 'DOCS',
      query_vector: Array(PACKET_DENSE_VECTOR_DIMENSIONS).fill(0),
      product: 'tRPC',
      product_version: '11',
      limit: 25,
    });
    expect(valid).toMatchObject({ scope: 'DOCS', product: 'tRPC', product_version: '11', limit: 25 });

    expect(atlasPacketDenseSearchInputSchema.safeParse({
      scope: 'DOCS', query_vector: Array(384).fill(0),
    }).success).toBe(false);
    expect(atlasPacketDenseSearchInputSchema.safeParse({
      scope: 'DOCS', query_vector: Array(PACKET_DENSE_VECTOR_DIMENSIONS).fill(0), collection: 'codebase_chunks_768',
    }).success).toBe(false);
    expect(atlasPacketDenseSearchInputSchema.safeParse({
      scope: 'DOCS', query_vector: Array(PACKET_DENSE_VECTOR_DIMENSIONS).fill(0), limit: 26,
    }).success).toBe(false);
  });

  it('bounds feature evidence tuple requests to a short id and sixteen existing rows', () => {
    expect(featureEvidenceTuplesInputSchema.parse({ featureId: 'feature-a' })).toEqual({
      featureId: 'feature-a',
      maxTuples: FEATURE_EVIDENCE_TUPLES_MAX,
    });
    expect(featureEvidenceTuplesInputSchema.safeParse({ featureId: 'x'.repeat(257) }).success).toBe(false);
    expect(featureEvidenceTuplesInputSchema.safeParse({ featureId: 'feature-a', maxTuples: FEATURE_EVIDENCE_TUPLES_MAX + 1 }).success)
      .toBe(false);
  });

  it('keeps successful output JSON within the byte cap and fails closed above it', () => {
    const withinLimit = serializeBoundedReadResult({ ok: true, value: 'x'.repeat(100) });
    expect(new TextEncoder().encode(withinLimit).byteLength).toBeLessThanOrEqual(MCP_READ_MAX_OUTPUT_BYTES);
    expect(JSON.parse(withinLimit)).toEqual({ ok: true, value: 'x'.repeat(100) });

    const overLimit = serializeBoundedReadResult({ ok: true, value: 'x'.repeat(MCP_READ_MAX_OUTPUT_BYTES + 1) });
    expect(new TextEncoder().encode(overLimit).byteLength).toBeLessThanOrEqual(MCP_READ_MAX_OUTPUT_BYTES);
    expect(JSON.parse(overLimit)).toMatchObject({ ok: false, error: 'MCP_READ_OUTPUT_LIMIT_EXCEEDED' });
    expect(JSON.parse(serializeBoundedReadResult({ value: 42n }, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    ))).toEqual({ value: '42' });
  });

  it('trims and caps feature-document read identifiers', () => {
    expect(featureDocumentReadInputSchema.parse({ featureId: '  langchain-python  ' })).toEqual({
      featureId: 'langchain-python',
    });
    expect(featureDocumentReadInputSchema.safeParse({ featureId: '   ' }).success).toBe(false);
    expect(featureDocumentReadInputSchema.safeParse({ featureId: 'x'.repeat(FEATURE_DOCUMENT_ID_MAX_CHARS + 1) }).success)
      .toBe(false);
  });

  it('trims feature-evidence tuple identifiers and retains a bounded tuple count', () => {
    expect(featureEvidenceTuplesInputSchema.parse({ featureId: '  langchain-python  ' })).toEqual({
      featureId: 'langchain-python',
      maxTuples: FEATURE_EVIDENCE_TUPLES_MAX,
    });
    expect(featureEvidenceTuplesInputSchema.safeParse({ featureId: '   ' }).success).toBe(false);
    expect(featureEvidenceTuplesInputSchema.safeParse({ featureId: 'x'.repeat(FEATURE_DOCUMENT_ID_MAX_CHARS + 1) }).success)
      .toBe(false);
  });

  it('keeps feature-document inspection inside the shared short read timeout', () => {
    expect(FEATURE_DOCUMENT_READ_STATEMENT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(FEATURE_DOCUMENT_READ_STATEMENT_TIMEOUT_MS).toBeLessThanOrEqual(5000);
    expect(FEATURE_DOCUMENT_MANIFEST_MAX_BYTES).toBe(256 * 1024);
    expect(FEATURE_DOCUMENT_DIRECTORY_MAX_ENTRIES).toBe(256);
  });
});

describe('atlas.packet_dense_search advertised schema (MCP tools/list conformance)', () => {
  it('serializes as type: object with no top-level anyOf (a non-object inputSchema makes MCP clients reject ALL tools)', () => {
    const json = z.toJSONSchema(atlasPacketDenseSearchAdvertisedSchema) as Record<string, unknown>;
    expect(json.type).toBe('object');
    expect(json.anyOf).toBeUndefined();
    expect(json.oneOf).toBeUndefined();
  });
  it('documents the fields of both scopes so a model can call it', () => {
    const props = Object.keys((z.toJSONSchema(atlasPacketDenseSearchAdvertisedSchema) as { properties: Record<string, unknown> }).properties);
    expect(props).toEqual(expect.arrayContaining(['scope', 'collection', 'query_text', 'query_vector', 'feature_id', 'product']));
  });
  it('accepts every input the strict union accepts (no valid call is lost) and keeps unknown keys for strict DOCS rejection', () => {
    const code = { feature_id: 'feature-a', collection: 'codebase_chunks_768', query_text: 'q' };
    const docs = { scope: 'DOCS', query_vector: Array(PACKET_DENSE_VECTOR_DIMENSIONS).fill(0) };
    for (const input of [code, docs]) {
      expect(atlasPacketDenseSearchInputSchema.safeParse(input).success).toBe(true);
      expect(atlasPacketDenseSearchAdvertisedSchema.safeParse(input).success).toBe(true);
    }
    const strayDocs = { ...docs, stray: 1 };
    expect(atlasPacketDenseSearchAdvertisedSchema.parse(strayDocs)).toHaveProperty('stray');
    expect(atlasPacketDenseSearchInputSchema.safeParse(strayDocs).success).toBe(false);
  });
});

describe('atlas.packet_dense_search: advertised schema never weakens runtime validation', () => {
  const vec = Array(PACKET_DENSE_VECTOR_DIMENSIONS).fill(0);
  const samples: Array<[string, Record<string, unknown>, boolean]> = [
    ['valid CODE with text', { feature_id: 'f', collection: 'codebase_chunks_768', query_text: 'q' }, true],
    ['valid CODE with vector', { source_ref: 's', collection: 'codebase_chunks_768_v2', query_vector: vec }, true],
    ['valid DOCS', { scope: 'DOCS', query_vector: vec }, true],
    ['hybrid: DOCS scope carrying CODE-only fields (DOCS branch is strict)', { scope: 'DOCS', query_vector: vec, feature_id: 'f', collection: 'codebase_chunks_768' }, false],
    ['CODE without any selective filter', { collection: 'codebase_chunks_768', query_text: 'q' }, false],
    ['CODE with both query_text and query_vector', { feature_id: 'f', collection: 'codebase_chunks_768', query_text: 'q', query_vector: vec }, false],
    ['DOCS without query_vector', { scope: 'DOCS' }, false],
    ['wrong vector dimension', { scope: 'DOCS', query_vector: [0, 1] }, false],
  ];
  for (const [label, input, expected] of samples) {
    it(`${label}: strict union => ${expected}; advertised-then-union decision is identical`, () => {
      expect(atlasPacketDenseSearchInputSchema.safeParse(input).success).toBe(expected);
      const viaAdvertised = atlasPacketDenseSearchAdvertisedSchema.safeParse(input);
      // The advertised schema may reject malformed types earlier, but it must never turn an invalid call into a valid one.
      const finalDecision = viaAdvertised.success && atlasPacketDenseSearchInputSchema.safeParse(viaAdvertised.data).success;
      expect(finalDecision).toBe(expected);
    });
  }
});
