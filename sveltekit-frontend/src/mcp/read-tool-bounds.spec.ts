import { describe, expect, it } from 'vitest';
import {
  atlasPacketSearchInputSchema,
  featureEvidenceTuplesInputSchema,
  FEATURE_EVIDENCE_TUPLES_MAX,
  graphAnalysisNeighborhoodInputSchema,
  graphExpandNeighborhoodInputSchema,
  graphShortestPathInputSchema,
  GRAPH_ANALYSIS_PATH_MAX_CHARS,
  GRAPH_SHORTEST_PATH_MAX_HOPS,
  GRAPH_EXPAND_NEIGHBORHOOD_MAX_SEEDS,
  GRAPH_EXPAND_REF_MAX_CHARS,
  GRAPH_EXPAND_TEXT_MAX_CHARS,
  MCP_READ_MAX_OUTPUT_BYTES,
  PACKET_SEARCH_FILTER_MAX_CHARS,
  PACKET_SEARCH_TEXT_MAX_CHARS,
  serializeBoundedReadResult,
} from './read-tool-bounds.js';

describe('ORF-7 read-tool input bounds', () => {
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

    expect(graphShortestPathInputSchema.parse({ from: 'src/a.ts', to: 'src/b.ts', maxHops: GRAPH_SHORTEST_PATH_MAX_HOPS }).maxHops)
      .toBe(GRAPH_SHORTEST_PATH_MAX_HOPS);
    expect(graphShortestPathInputSchema.safeParse({ from: 'x'.repeat(GRAPH_ANALYSIS_PATH_MAX_CHARS + 1), to: 'src/b.ts' }).success)
      .toBe(false);
    expect(graphShortestPathInputSchema.safeParse({ from: 'src/a.ts', to: 'src/b.ts', maxHops: GRAPH_SHORTEST_PATH_MAX_HOPS + 1 }).success)
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
  });
});
