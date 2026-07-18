import type { AtlasIntent, AtlasSearchMode } from '../contracts/query-analysis';

export function classifyQueryIntent(query: string): { intent: AtlasIntent; mode: AtlasSearchMode } {
  const lower = query.toLowerCase();
  if (/error|exception|failed|failure|stack trace/.test(lower)) {
    return { intent: 'fix_error', mode: 'hybrid' };
  }
  if (/todo|tech debt|cleanup|refactor/.test(lower)) {
    return { intent: 'find_todo', mode: 'hybrid' };
  }
  if (/trace|telemetry|span|log/.test(lower)) {
    return { intent: 'trace_telemetry', mode: 'graph' };
  }
  if (/memory|what did we decide|remember/.test(lower)) {
    return { intent: 'retrieve_memory', mode: 'semantic' };
  }
  return { intent: 'hybrid_search', mode: 'hybrid' };
}

