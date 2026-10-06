import { describe, expect, it } from 'vitest';
import { buildMcpToolViterbiFramesV1, scoreMcpToolForRoutingV1 } from './mcp-tool-viterbi-frame-compiler-v1.js';

const readTool = {
  ref: { serverAuthorityId: 'trace', toolName: 'ops.search_tools' },
  toolSchemaDigest: 'sha256:search-tools',
  domains: ['retrieval', 'code'],
  intents: ['symbol_lookup', 'tool_discovery'],
  capabilities: ['lexical', 'registry_search', 'read'],
  phases: ['DISCOVER', 'INSPECT'] as const,
  readOnly: true,
  successRate: 0.9,
  latencyScore: 0.9,
  costScore: 0.9,
};

const graphTool = {
  ref: { serverAuthorityId: 'trace', toolName: 'graph_expand_neighborhood' },
  toolSchemaDigest: 'sha256:graph-expand',
  domains: ['graph', 'code'],
  intents: ['dependency_trace'],
  capabilities: ['graph', 'expand'],
  phases: ['EXPAND'] as const,
  readOnly: true,
  successRate: 0.8,
  latencyScore: 0.5,
  costScore: 0.6,
};

describe('mcp-tool-viterbi-frame-compiler-v1', () => {
  it('prefers the domain/intent/capability matching tool deterministically', () => {
    const observation = {
      revision: 'routing:v1',
      phase: 'DISCOVER' as const,
      intent: 'symbol_lookup',
      domain: 'retrieval',
      evidenceState: 'MISSING' as const,
      preferredCapabilities: ['registry_search', 'lexical'],
    };
    expect(scoreMcpToolForRoutingV1(observation, readTool)).toBeGreaterThan(0.8);
    const frames = buildMcpToolViterbiFramesV1({ observations: [observation], profiles: [graphTool, readTool] });
    expect(frames[0]?.candidates[0]?.value.ref.toolName).toBe('ops.search_tools');
  });

  it('builds a bounded multi-phase path without DB/vector/graph lookups', () => {
    const frames = buildMcpToolViterbiFramesV1({
      observations: [
        {
          revision: 'routing:discover:v1',
          phase: 'DISCOVER',
          intent: 'symbol_lookup',
          domain: 'retrieval',
          evidenceState: 'MISSING',
          preferredCapabilities: ['registry_search'],
        },
        {
          revision: 'routing:expand:v1',
          phase: 'EXPAND',
          intent: 'dependency_trace',
          domain: 'graph',
          evidenceState: 'PARTIAL',
          preferredCapabilities: ['graph', 'expand'],
        },
      ],
      profiles: [readTool, graphTool],
      maxCandidatesPerFrame: 4,
    });
    expect(frames).toHaveLength(2);
    expect(frames[0]?.candidates[0]?.value.ref.toolName).toBe('ops.search_tools');
    expect(frames[1]?.candidates[0]?.value.ref.toolName).toBe('graph_expand_neighborhood');
  });

  it('excludes write-capable tools from proposal frames', () => {
    const writeTool = { ...readTool, ref: { serverAuthorityId: 'trace', toolName: 'record_outcome' }, readOnly: false };
    expect(() => buildMcpToolViterbiFramesV1({
      observations: [{
        revision: 'routing:v1',
        phase: 'DISCOVER',
        intent: 'tool_discovery',
        domain: 'retrieval',
        evidenceState: 'MISSING',
        preferredCapabilities: ['registry_search'],
      }],
      profiles: [writeTool],
    })).toThrow('NO_ELIGIBLE_TOOL_CANDIDATES');
  });
});
