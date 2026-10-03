import { describe, expect, it } from 'vitest';
import {
  ATLAS_HELPER_MCP_INTEGRATION_V1,
  assertAtlasHelperMcpAlignmentV1,
  type AtlasHelperMcpIntegrationV1,
} from './mcp-helper-integration-v1';

describe('mcp-helper-integration-v1', () => {
  it('accepts the frozen integration map', () => {
    expect(() => assertAtlasHelperMcpAlignmentV1()).not.toThrow();
  });

  it('keeps all semantic executors on one logical vote', () => {
    const semanticExecutors = ATLAS_HELPER_MCP_INTEGRATION_V1.filter(
      (entry) => entry.logicalLane === 'SEMANTIC_768' && entry.role === 'EXECUTOR',
    );

    expect(semanticExecutors.map((entry) => entry.integrationId).sort()).toEqual([
      'cuvs-cagra-semantic-executor',
      'pgvector-exact-executor',
      'qdrant-semantic-executor',
      'turbovec-semantic-executor',
    ]);
    expect(semanticExecutors.every((entry) => entry.separateFusionVote === false)).toBe(true);
  });

  it('fails closed if an executor is accidentally promoted to another semantic vote', () => {
    const bad: AtlasHelperMcpIntegrationV1[] = ATLAS_HELPER_MCP_INTEGRATION_V1.map((entry) =>
      entry.integrationId === 'turbovec-semantic-executor'
        ? { ...entry, separateFusionVote: true }
        : { ...entry },
    );

    expect(() => assertAtlasHelperMcpAlignmentV1(bad)).toThrow(
      'SEMANTIC_EXECUTOR_VOTE_INFLATION:turbovec-semantic-executor',
    );
  });

  it('keeps SearXNG as acquisition rather than internal retrieval authority', () => {
    const searxng = ATLAS_HELPER_MCP_INTEGRATION_V1.find(
      (entry) => entry.integrationId === 'searxng-web-acquisition',
    );

    expect(searxng).toMatchObject({
      logicalLane: 'WEB_ACQUISITION',
      role: 'ACQUISITION',
      canonicalAuthority: false,
      separateFusionVote: false,
    });
  });
});
