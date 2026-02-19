// Agentic Function Registry (Node-side mirror)
import type { AnyFunction } from '../types';

// Placeholder functions
export async function webSearch(query: string) {
  return { results: [], query };
}

export async function expandContext(text: string) {
  // call embedding service or Ollama via HTTP
  return { embedding: [] };
}

export async function summarizeClusters(clusters: any[]) {
  return clusters.map(c => String(c)).join('; ');
}

export const AGENTIC_FUNCTIONS: Record<string, AnyFunction> = {
  web_search: webSearch,
  expand_context: expandContext,
  summarize_clusters: summarizeClusters
};

export async function callAgentFunction(name: string, ...args: any[]) {
  const fn = AGENTIC_FUNCTIONS[name];
  if (!fn) throw new Error(`Unknown agent function: ${name}`);
  return fn(...args);
}
