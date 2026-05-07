#!/usr/bin/env node
/**
 * One-shot script: migrate ops/hypergraph/knowledge tools in trace-mcp-server.ts
 * from raw JSON Schema format to Zod schemas. Run once, then delete.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = resolve(__dirname, '..', 'src/mcp/trace-mcp-server.ts');
let content = readFileSync(path, 'utf8');

const migrations = [
  {
    tag: 'ops.propose_patch',
    find: [
      "    description: 'Read a source file and propose a targeted fix. Returns the current content and a recommended diff. Does NOT write anything. Requires operator_token.',",
      "    inputSchema: {",
      "      type: 'object' as const,",
      "      properties: {",
      "        operator_token: { type: 'string', description: 'Non-empty approval token' },",
      "        file_path:      { type: 'string', description: 'Repo-relative file path to inspect' },",
      "        issue:          { type: 'string', description: 'Description of the issue to fix' },",
      "        context_lines:  { type: 'number', description: 'Lines of context to return (default 40)', minimum: 5, maximum: 200 },",
      "      },",
      "      required: ['operator_token', 'file_path', 'issue'],",
      "    },",
      "  },",
      "  async ({ operator_token, file_path, issue, context_lines }: {",
      "    operator_token: unknown; file_path: unknown; issue: unknown; context_lines?: unknown;",
      "  }) => {",
    ].join('\n'),
    replace: [
      "    operator_token: z.string().describe('Non-empty approval token'),",
      "    file_path:      z.string().describe('Repo-relative file path to inspect'),",
      "    issue:          z.string().describe('Description of the issue to fix'),",
      "    context_lines:  z.number().int().min(5).max(200).optional().describe('Lines of context to return (default 40)'),",
      "  },",
      "  async ({ operator_token, file_path, issue, context_lines }) => {",
    ].join('\n'),
  },
  {
    tag: 'ops.run_targeted_test',
    find: [
      "    description: 'Run a specific vitest test file and return the output. Requires operator_token.',",
      "    inputSchema: {",
      "      type: 'object' as const,",
      "      properties: {",
      "        operator_token: { type: 'string', description: 'Non-empty approval token' },",
      "        test_file:      { type: 'string', description: 'Path to the test file relative to project root, e.g. tests/foo.spec.ts' },",
      "        timeout_ms:     { type: 'number', description: 'Max wait in ms (default 30000, max 120000)' },",
      "      },",
      "      required: ['operator_token', 'test_file'],",
      "    },",
      "  },",
      "  async ({ operator_token, test_file, timeout_ms }: {",
      "    operator_token: unknown; test_file: unknown; timeout_ms?: unknown;",
      "  }) => {",
    ].join('\n'),
    replace: [
      "    operator_token: z.string().describe('Non-empty approval token'),",
      "    test_file:      z.string().describe('Path to the test file relative to project root, e.g. tests/foo.spec.ts'),",
      "    timeout_ms:     z.number().int().min(5000).max(120000).optional().describe('Max wait in ms (default 30000)'),",
      "  },",
      "  async ({ operator_token, test_file, timeout_ms }) => {",
    ].join('\n'),
  },
  {
    tag: 'ops.run_quality_gate',
    find: [
      "    description: 'Run tsc --noEmit --skipLibCheck and return pass/fail + error count. Requires operator_token.',",
      "    inputSchema: {",
      "      type: 'object' as const,",
      "      properties: {",
      "        operator_token: { type: 'string', description: 'Non-empty approval token' },",
      '        gate:           { type: \'string\', description: \'"tsc" (default) or "vitest-all" to run full test suite\', enum: [\'tsc\', \'vitest-all\'] },',
      "        timeout_ms:     { type: 'number', description: 'Max wait in ms (default 60000, max 300000)' },",
      "      },",
      "      required: ['operator_token'],",
      "    },",
      "  },",
      "  async ({ operator_token, gate, timeout_ms }: {",
      "    operator_token: unknown; gate?: unknown; timeout_ms?: unknown;",
      "  }) => {",
    ].join('\n'),
    replace: [
      "    operator_token: z.string().describe('Non-empty approval token'),",
      '    gate:           z.enum([\'tsc\', \'vitest-all\']).optional().describe(\'"tsc" (default) or "vitest-all" to run full test suite\'),',
      "    timeout_ms:     z.number().int().min(5000).max(300000).optional().describe('Max wait in ms (default 60000)'),",
      "  },",
      "  async ({ operator_token, gate, timeout_ms }) => {",
    ].join('\n'),
  },
  {
    tag: 'hypergraph.get_edge',
    find: [
      "    description: 'Fetch a single hyperedge by edge_hash, with all member stable_keys and metadata.',",
      "    inputSchema: {",
      "      type: 'object' as const,",
      "      properties: {",
      "        edge_hash: { type: 'string', description: 'The edge_hash to look up' },",
      "        expand:    { type: 'boolean', description: 'If true, also return related edges sharing at least one member' },",
      "      },",
      "      required: ['edge_hash'],",
      "    },",
      "  },",
      "  async ({ edge_hash, expand }: { edge_hash: unknown; expand?: unknown }) => {",
    ].join('\n'),
    replace: [
      "    edge_hash: z.string().max(128).describe('The edge_hash to look up'),",
      "    expand:    z.boolean().optional().describe('If true, also return related edges sharing at least one member'),",
      "  },",
      "  async ({ edge_hash, expand }) => {",
    ].join('\n'),
  },
  {
    tag: 'hypergraph.explain_activation',
    find: [
      "    description: 'Explain why a hyperedge was activated for a set of query terms — shows which terms matched which members, coverage ratio.',",
      "    inputSchema: {",
      "      type: 'object' as const,",
      "      properties: {",
      "        edge_hash:   { type: 'string', description: 'The edge_hash to explain' },",
      "        query_terms: { type: 'array', items: { type: 'string' }, description: 'List of query terms that triggered activation' },",
      "      },",
      "      required: ['edge_hash', 'query_terms'],",
      "    },",
      "  },",
      "  async ({ edge_hash, query_terms }: { edge_hash: unknown; query_terms: unknown }) => {",
    ].join('\n'),
    replace: [
      "    edge_hash:   z.string().max(128).describe('The edge_hash to explain'),",
      "    query_terms: z.array(z.string().max(100)).describe('List of query terms that triggered activation'),",
      "  },",
      "  async ({ edge_hash, query_terms }) => {",
    ].join('\n'),
  },
  {
    tag: 'hypergraph.expand_members',
    find: [
      "    description: 'Given an edge_hash, return all edges that share at least one member — useful for exploring the hypergraph neighbourhood.',",
      "    inputSchema: {",
      "      type: 'object' as const,",
      "      properties: {",
      "        edge_hash: { type: 'string', description: 'The edge_hash to expand from' },",
      "      },",
      "      required: ['edge_hash'],",
      "    },",
      "  },",
      "  async ({ edge_hash }: { edge_hash: unknown }) => {",
    ].join('\n'),
    replace: [
      "    edge_hash: z.string().max(128).describe('The edge_hash to expand from'),",
      "  },",
      "  async ({ edge_hash }) => {",
    ].join('\n'),
  },
];

// Handle ops.record_fix_attempt separately (has escaped quotes in description)
const recordFind = `    description: 'Persist fix attempt metadata to fix_attempts table (audit only — does not modify source files). Requires operator_token.',`;
const recordIdx = content.indexOf(recordFind);
if (recordIdx !== -1) {
  const blockStart = content.lastIndexOf("  'ops.record_fix_attempt',", recordIdx);
  const blockEnd = content.indexOf('  }) => {', recordIdx) + '  }) => {'.length;
  const oldBlock = content.slice(blockStart + "  'ops.record_fix_attempt',\n".length, blockEnd);
  const newBlock = [
    "    operator_token:  z.string().describe('Non-empty approval token'),",
    "    fix_type:        z.string().max(100).describe('Category of fix, e.g. \"type-error\", \"logic-bug\"'),",
    "    fix_description: z.string().max(2000).describe('Human-readable description of the proposed fix'),",
    "    fix_diff:        z.string().max(8000).optional().describe('Unified diff or summary of the change'),",
    "    files_affected:  z.number().int().min(0).optional().describe('Number of files the fix touches (default 1)'),",
    "    errors_resolved: z.number().int().min(0).optional().describe('Estimated errors this fix resolves (default 1)'),",
    "    success:         z.boolean().optional().describe('Whether the fix was verified to work (omit if unknown)'),",
    "    metadata:        z.record(z.unknown()).optional().describe('Extra context (e.g. test result, issue ID)'),",
    "  },",
    "  async ({ operator_token, fix_type, fix_description, fix_diff, files_affected, errors_resolved, success, metadata }) => {",
  ].join('\n');
  content = content.slice(0, blockStart + "  'ops.record_fix_attempt',\n".length) + newBlock + content.slice(blockEnd);
  console.log('Applied: ops.record_fix_attempt');
} else {
  console.warn('NOT FOUND: ops.record_fix_attempt description block');
}

// Handle knowledge.get_minified_map separately (has escaped quotes)
const kmFind = `    description: 'Return a compact knowledge map: top hyperedges by grade, cluster summaries, and AGENTS.md directives for a directory. Designed for tight context budgets.',`;
const kmIdx = content.indexOf(kmFind);
if (kmIdx !== -1) {
  const blockStart = content.lastIndexOf("  'knowledge.get_minified_map',", kmIdx);
  const handlerStart = content.indexOf('  async ({ directory, max_edges, max_agents }: {', kmIdx);
  const handlerEnd = content.indexOf('  }) => {', handlerStart) + '  }) => {'.length;
  const newBlock = [
    "    directory:  z.string().max(200).optional().describe('Relative directory path (e.g. \"src/lib/server/ai\")'),",
    "    max_edges:  z.number().int().min(1).max(20).optional().describe('Max hyperedges to include (default 5)'),",
    "    max_agents: z.number().int().min(1).max(10).optional().describe('Max AGENTS.md directives to include (default 3)'),",
    "  },",
    "  async ({ directory, max_edges, max_agents }) => {",
  ].join('\n');
  content = content.slice(0, blockStart + "  'knowledge.get_minified_map',\n".length) + newBlock + content.slice(handlerEnd);
  console.log('Applied: knowledge.get_minified_map');
} else {
  console.warn('NOT FOUND: knowledge.get_minified_map description block');
}

// Handle hypergraph.search separately (has em dash in description)
const hsFind = `    description: 'Search hyperedges by query terms using Postgres FTS + member activation scoring. Returns edges ranked by coverage × grade × confidence.',`;
const hsIdx = content.indexOf(hsFind);
if (hsIdx !== -1) {
  const blockStart = content.lastIndexOf("  'hypergraph.search',", hsIdx);
  const handlerStart = content.indexOf('  async ({ query, edge_types, limit, min_confidence }: {', hsIdx);
  const handlerEnd = content.indexOf('  }) => {', handlerStart) + '  }) => {'.length;
  const newBlock = [
    "    query:          z.string().max(500).describe('Natural language query (1-500 chars)'),",
    "    edge_types:     z.array(z.string()).optional().describe('Filter by edge_type (agents_md, cluster_summary, codebase_chunk, generic)'),",
    "    limit:          z.number().int().min(1).max(50).optional().describe('Max results 1-50 (default 10)'),",
    "    min_confidence: z.number().min(0).max(1).optional().describe('Minimum confidence threshold 0-1'),",
    "  },",
    "  async ({ query, edge_types, limit, min_confidence }) => {",
  ].join('\n');
  content = content.slice(0, blockStart + "  'hypergraph.search',\n".length) + newBlock + content.slice(handlerEnd);
  console.log('Applied: hypergraph.search');
} else {
  console.warn('NOT FOUND: hypergraph.search description block');
}

// Apply remaining string-based migrations
let applied = 0;
for (const { tag, find, replace } of migrations) {
  if (content.includes(find)) {
    content = content.replace(find, replace);
    applied++;
    console.log('Applied:', tag);
  } else {
    console.warn('NOT FOUND:', tag);
  }
}

writeFileSync(path, content, 'utf8');
console.log(`\nDone — ${applied} string migrations + up to 3 block migrations`);
