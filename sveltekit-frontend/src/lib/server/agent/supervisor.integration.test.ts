import { beforeEach, describe, expect, it, vi } from 'vitest';

const searchRuntimeSearch = vi.fn(async (input: { query: string; limit: number }) => ({
  query: input.query,
  topK: input.limit,
  packets: [
    {
      packet_key: 'packet:retrieval-contract',
      source_ref: 'src/lib/server/retrieval/search-runtime.ts',
      summary: 'Canonical retrieval runtime evidence.',
      title_id: 'concept:canonical-retrieval',
      domain_class: 'retrieval',
      qdrant_point_id: 'point-retrieval-contract',
      tree_node_id: 'tree-retrieval-contract',
      retrieval_score: 0.97,
    },
  ],
  metadata: {
    query: input.query,
    durationMs: 12,
  },
  provenance: {
    retrievalSources: ['qdrant', 'postgres_trigram', 'exact_symbol', 'ast_tree'],
    fusionMethod: 'rrf',
    rerankModel: 'mixedbread-ai/mxbai-rerank-base-v2',
  },
}));

const searchCodebaseToolInvoke = vi.fn(async (input: { query: string; limit?: number }) =>
  JSON.stringify(await searchRuntimeSearch({ query: input.query, limit: input.limit ?? 10 })),
);

const recordOutcomeMock = vi.fn(async () => undefined);

vi.mock('@langchain/langgraph', () => {
  class MockStateGraph {
    private nodes = new Map<string, (state: any) => Promise<any> | any>();
    private routeNodeName: string | null = null;
    private routeSelector: ((state: any) => string) | null = null;

    addNode(name: string, fn: (state: any) => Promise<any> | any) {
      this.nodes.set(name, fn);
      return this;
    }

    addEdge() {
      return this;
    }

    addConditionalEdges(name: string, selector: (state: any) => string) {
      this.routeNodeName = name;
      this.routeSelector = selector;
      return this;
    }

    compile() {
      const nodes = this.nodes;
      const routeNodeName = this.routeNodeName;
      const routeSelector = this.routeSelector;

      return {
        invoke: async (state: any) => {
          const routedState = routeNodeName && nodes.has(routeNodeName)
            ? {
                ...state,
                ...(await nodes.get(routeNodeName)!(state)),
              }
            : { ...state };

          const route = routeSelector ? routeSelector(routedState) : routedState.route;
          const routeNode = nodes.get(route);

          if (!routeNode) {
            return routedState;
          }

          const routedResult = await routeNode({
            ...routedState,
            route,
          });

          return {
            ...routedState,
            ...routedResult,
            route,
          };
        },
        stream: async function* (state: any) {
          const result = await this.invoke(state);
          yield { route: result.route ?? state.route, data: result };
        },
      };
    }
  }

  return {
    Annotation: {
      Root: (schema: unknown) => ({ State: schema }),
    },
    END: 'END',
    START: 'START',
    StateGraph: MockStateGraph,
  };
});

vi.mock('@langchain/ollama', () => ({
  ChatOllama: class {
    async invoke() {
      return { content: 'retrieval_contract' };
    }
  },
}));

vi.mock('$lib/server/telemetry/tool-call-recorder.js', () => ({
  recordOutcome: (...args: unknown[]) => recordOutcomeMock(...args),
}));

vi.mock('./subagents.js', () => ({
  SPECIALIST_AGENT_NAMES: ['retrieval_contract', 'validation'],
  SPECIALIST_AGENT_PROFILES: {
    retrieval_contract: {
      tools: ['search_codebase'],
      prompt: 'retrieval',
      displayName: 'Retrieval Contract Agent',
      description: 'Owns retrieval runtime contracts.',
      keywords: ['retrieval'],
      acceptanceGates: ['identity normalization happens before RRF'],
      authorization: { readOnly: true, writeAccess: false, shellAccess: false },
    },
    validation: {
      tools: [],
      prompt: 'validation',
      displayName: 'Validation Agent',
      description: 'Owns tests and evidence only.',
      keywords: ['validation'],
      acceptanceGates: ['typecheck'],
      authorization: { readOnly: true, writeAccess: false, shellAccess: false },
    },
  },
  SUBAGENT_NAMES: ['retrieval_contract', 'validation'],
  classifyIntent: () => 'retrieval_contract',
  createSubagent: (name: string, allTools: Array<{ name: string; invoke?: (input: unknown) => Promise<unknown> }>) => {
    return {
      name,
      toolNames: allTools.map((tool) => tool.name),
      prompt: name,
      authorization:
        name === 'retrieval_contract'
          ? { readOnly: true, writeAccess: false, shellAccess: false }
          : { readOnly: true, writeAccess: false, shellAccess: false },
      agent: {
        invoke: async () => {
          const searchTool = allTools.find((tool) => tool.name === 'search_codebase');
          if (searchTool?.invoke) {
            const output = await searchTool.invoke({ query: 'qdrant rrf topK', limit: 7 });
            return {
              messages: [
                { _getType: () => 'tool', name: 'search_codebase', tool_call_id: 'call-1', content: output },
                { _getType: () => 'assistant', content: 'retrieval complete' },
              ],
            };
          }

          return { messages: [{ _getType: () => 'assistant', content: 'no tool available' }] };
        },
      },
    };
  },
}));

describe('SupervisorAgent retrieval integration', () => {
  beforeEach(() => {
    searchRuntimeSearch.mockClear();
    searchCodebaseToolInvoke.mockClear();
    recordOutcomeMock.mockClear();
  });

  it('routes to the retrieval specialist, invokes search_codebase, and records validated outcomes', async () => {
    const { SupervisorAgent } = await import('./supervisor.js');
    const searchCodebase = {
      name: 'search_codebase',
      description: 'Canonical HyperRAG codebase search.',
      invoke: searchCodebaseToolInvoke,
    } as unknown as { name: string; description: string; invoke: (input: { query: string; limit?: number }) => Promise<string> };

    const supervisor = new SupervisorAgent([searchCodebase], { verbose: false, maxIterations: 1, timeout: 5_000 });
    const result = await supervisor.investigate('Use retrieval topk rrf qdrant search codebase', {
      threadId: 'thread-retrieval-1',
    });

    expect(result.route).toBe('retrieval_contract');
    expect(searchCodebaseToolInvoke).toHaveBeenCalledTimes(1);
    expect(searchCodebaseToolInvoke).toHaveBeenCalledWith({ query: 'qdrant rrf topK', limit: 7 });
    expect(searchRuntimeSearch).toHaveBeenCalledWith({ query: 'qdrant rrf topK', limit: 7 });
    expect(result.toolCalls.map((call) => call.tool)).toContain('search_codebase');
    expect(result.answer).toContain('retrieval complete');
    expect(recordOutcomeMock).toHaveBeenCalledTimes(1);
    expect(recordOutcomeMock.mock.calls[0]?.[0]).toMatchObject({
      outcomeType: 'supervisor_validated',
      taskId: 'thread-retrieval-1',
      traceId: 'thread-retrieval-1',
      score: 1,
      reward: 1,
    });
  });
});
