// Integration regression for scripts/atlas/runtime-mcp-tool-selector.mjs (AFC-TOOL-ROUTING-01).
// Needs live Ollama (embeddinggemma) and the atlas_tool_manifest_vectors_v1 table; skips otherwise.
// Guards the 2026-11-01 failure: every query collapsed to the same registry-fallback tool set.
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectToolsForQuery } from './runtime-mcp-tool-selector.mjs';

process.env.OLLAMA_HOST = (process.env.OLLAMA_HOST ?? '127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');

const CASES = [
  { query: 'search the codebase for a function by name', anyOf: ['codebase.rg_search', 'search.hybrid', 'codebase:rg_search'] },
  { query: 'expand the graph neighborhood of a file', anyOf: ['graph.expand_neighborhood', 'kb.expand_neighbors'] },
  { query: 'check database schema tables', anyOf: ['db.table_inspect', 'db.schema_overview'] },
  { query: 'find knowledge base cards about retrieval', anyOf: ['kb.search_cards', 'kb.get_card'] },
];

let live = true;
let first;
try {
  first = await selectToolsForQuery(CASES[0].query, { topK: 5 });
  live = first.retrieval_source === 'pgvector';
} catch {
  live = false;
}
const skip = live ? false : 'pgvector tool table or embedding service unavailable';

for (const c of CASES) {
  test(`pgvector ranks a topical tool in top 5: ${c.query}`, { skip }, async () => {
    const sel = c.query === CASES[0].query ? first : await selectToolsForQuery(c.query, { topK: 5 });
    assert.equal(sel.retrieval_source, 'pgvector');
    assert.ok(sel.mcp_names.some((n) => c.anyOf.includes(n)), `expected one of ${c.anyOf} in ${sel.mcp_names}`);
  });
}

test('different queries do not collapse to one tool set', { skip }, async () => {
  const sets = new Set();
  for (const c of CASES) sets.add([...(await selectToolsForQuery(c.query, { topK: 5 })).mcp_names].sort().join('|'));
  assert.equal(sets.size, CASES.length);
});
