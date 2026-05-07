#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = resolve(__dirname, '..', 'src/mcp/trace-mcp-server.ts');
let c = readFileSync(filePath, 'utf8');

const tools = [
  {
    name: 'ops.propose_patch',
    descMarker: "    description: 'Read a source file and propose a targeted fix.",
    handlerEnd:   "  async ({ operator_token, file_path, issue, context_lines }: {\r\n    operator_token: unknown; file_path: unknown; issue: unknown; context_lines?: unknown;\r\n  }) => {",
    handlerEndAlt:"  async ({ operator_token, file_path, issue, context_lines }: {\n    operator_token: unknown; file_path: unknown; issue: unknown; context_lines?: unknown;\n  }) => {",
    newBlock: [
      "    operator_token: z.string().describe('Non-empty approval token'),",
      "    file_path:      z.string().describe('Repo-relative file path to inspect'),",
      "    issue:          z.string().describe('Description of the issue to fix'),",
      "    context_lines:  z.number().int().min(5).max(200).optional().describe('Lines of context to return (default 40)'),",
      "  },",
      "  async ({ operator_token, file_path, issue, context_lines }) => {",
    ].join('\n'),
    toolTag: "  'ops.propose_patch',",
  },
  {
    name: 'ops.run_targeted_test',
    descMarker: "    description: 'Run a specific vitest test file",
    handlerEnd:   "  async ({ operator_token, test_file, timeout_ms }: {\r\n    operator_token: unknown; test_file: unknown; timeout_ms?: unknown;\r\n  }) => {",
    handlerEndAlt:"  async ({ operator_token, test_file, timeout_ms }: {\n    operator_token: unknown; test_file: unknown; timeout_ms?: unknown;\n  }) => {",
    newBlock: [
      "    operator_token: z.string().describe('Non-empty approval token'),",
      "    test_file:      z.string().describe('Path to the test file relative to project root, e.g. tests/foo.spec.ts'),",
      "    timeout_ms:     z.number().int().min(5000).max(120000).optional().describe('Max wait in ms (default 30000)'),",
      "  },",
      "  async ({ operator_token, test_file, timeout_ms }) => {",
    ].join('\n'),
    toolTag: "  'ops.run_targeted_test',",
  },
  {
    name: 'ops.run_quality_gate',
    descMarker: "    description: 'Run tsc --noEmit --skipLibCheck",
    handlerEnd:   "  async ({ operator_token, gate, timeout_ms }: {\r\n    operator_token: unknown; gate?: unknown; timeout_ms?: unknown;\r\n  }) => {",
    handlerEndAlt:"  async ({ operator_token, gate, timeout_ms }: {\n    operator_token: unknown; gate?: unknown; timeout_ms?: unknown;\n  }) => {",
    newBlock: [
      "    operator_token: z.string().describe('Non-empty approval token'),",
      "    gate:           z.enum(['tsc', 'vitest-all']).optional().describe('tsc (default) or vitest-all to run full test suite'),",
      "    timeout_ms:     z.number().int().min(5000).max(300000).optional().describe('Max wait in ms (default 60000)'),",
      "  },",
      "  async ({ operator_token, gate, timeout_ms }) => {",
    ].join('\n'),
    toolTag: "  'ops.run_quality_gate',",
  },
  {
    name: 'hypergraph.get_edge',
    descMarker: "    description: 'Fetch a single hyperedge by edge_hash",
    handlerEnd:   "  async ({ edge_hash, expand }: { edge_hash: unknown; expand?: unknown }) => {",
    handlerEndAlt:"  async ({ edge_hash, expand }: { edge_hash: unknown; expand?: unknown }) => {",
    newBlock: [
      "    edge_hash: z.string().max(128).describe('The edge_hash to look up'),",
      "    expand:    z.boolean().optional().describe('If true, also return related edges sharing at least one member'),",
      "  },",
      "  async ({ edge_hash, expand }) => {",
    ].join('\n'),
    toolTag: "  'hypergraph.get_edge',",
  },
  {
    name: 'hypergraph.explain_activation',
    descMarker: "    description: 'Explain why a hyperedge was activated",
    handlerEnd:   "  async ({ edge_hash, query_terms }: { edge_hash: unknown; query_terms: unknown }) => {",
    handlerEndAlt:"  async ({ edge_hash, query_terms }: { edge_hash: unknown; query_terms: unknown }) => {",
    newBlock: [
      "    edge_hash:   z.string().max(128).describe('The edge_hash to explain'),",
      "    query_terms: z.array(z.string().max(100)).describe('List of query terms that triggered activation'),",
      "  },",
      "  async ({ edge_hash, query_terms }) => {",
    ].join('\n'),
    toolTag: "  'hypergraph.explain_activation',",
  },
  {
    name: 'hypergraph.expand_members',
    descMarker: "    description: 'Given an edge_hash, return all edges that share",
    handlerEnd:   "  async ({ edge_hash }: { edge_hash: unknown }) => {",
    handlerEndAlt:"  async ({ edge_hash }: { edge_hash: unknown }) => {",
    newBlock: [
      "    edge_hash: z.string().max(128).describe('The edge_hash to expand from'),",
      "  },",
      "  async ({ edge_hash }) => {",
    ].join('\n'),
    toolTag: "  'hypergraph.expand_members',",
  },
];

let applied = 0;
for (const { name, descMarker, handlerEnd, handlerEndAlt, newBlock, toolTag } of tools) {
  const idx = c.indexOf(descMarker);
  if (idx === -1) { console.warn('NOT FOUND (marker):', name); continue; }

  // Find end of handler signature (try both CRLF and LF variants)
  let handlerEndIdx = c.indexOf(handlerEnd, idx);
  let handlerEndLen = handlerEnd.length;
  if (handlerEndIdx === -1) {
    handlerEndIdx = c.indexOf(handlerEndAlt, idx);
    handlerEndLen = handlerEndAlt.length;
  }
  if (handlerEndIdx === -1) { console.warn('NOT FOUND (handler):', name, '— trying simpler match'); continue; }

  const toolTagIdx = c.lastIndexOf(toolTag, idx);
  if (toolTagIdx === -1) { console.warn('NOT FOUND (toolTag):', name); continue; }

  // Find the newline(s) after the tool tag
  let afterTagIdx = toolTagIdx + toolTag.length;
  // Skip \r\n or \n
  if (c[afterTagIdx] === '\r') afterTagIdx++;
  if (c[afterTagIdx] === '\n') afterTagIdx++;

  const blockEnd = handlerEndIdx + handlerEndLen;
  c = c.slice(0, afterTagIdx) + newBlock + c.slice(blockEnd);
  console.log('Fixed:', name);
  applied++;
}

writeFileSync(filePath, c, 'utf8');
console.log(`\nApplied ${applied}/${tools.length} fixes`);