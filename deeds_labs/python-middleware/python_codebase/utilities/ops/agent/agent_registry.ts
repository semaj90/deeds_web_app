// ops/agent/agent_registry.ts
// Simple agent function registry used by agent runtimes to find and call functions.

type AgentFunction = (...args: any[]) => Promise<any> | any;

const registry: Record<string, AgentFunction> = {};

export function register(name: string, fn: AgentFunction) {
  registry[name] = fn;
}

export function call(name: string, ...args: any[]) {
  const fn = registry[name];
  if (!fn) throw new Error(`Unknown agent function ${name}`);
  return fn(...args);
}

// Example functions
register('web_search', async (query: string) => {
  // TODO: integrate with your web search or internal index
  return [{ title: 'Mock result', url: 'https://example.com', snippet: `Results for ${query}` }];
});

register('summarize_clusters', async (clusterId: string) => {
  // TODO: fetch cluster docs and call summarization model (Triton/LLM)
  return `Summary for cluster ${clusterId}`;
});

export default registry;
