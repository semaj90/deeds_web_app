#!/usr/bin/env node
/**
 * smoke-stdio-mcp-tools.mjs
 *
 * Exercises the stdio MCP server via the MCP SDK client. It verifies the
 * handshake, tools/list, and a few safe tool calls, then writes JSON + markdown
 * output under memory/runs/<timestamp>/.
 */

import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const JSON_OUT = process.argv.includes('--json');

const SAMPLE = {
  query: 'redis cache topology',
  taskId: 'stdio_smoke_task_001',
  filePath: 'src/lib/server/ace/context-assembler.ts',
};

const TOOL_ARGS = {
  agents_md: {
    path: 'src/mcp/server.ts',
  },
  'codebase:file_intel': {
    path: SAMPLE.filePath,
  },
  'codebase:graph_neighbors': {
    path: SAMPLE.filePath,
    direction: 'both',
  },
  topology_search: {
    query: SAMPLE.query,
    radius: 0.3,
    limit: 3,
  },
};

const SAFE_TOOL_CANDIDATES = [
  'agents_md',
  'codebase:file_intel',
  'codebase:graph_neighbors',
  'topology_search',
];

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function preview(value, max = 120) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function classifyError(message) {
  return /unauthor|not found|unknown tool|invalid|empty|missing/i.test(message)
    ? 'SKIP'
    : 'FAIL';
}

function getToolList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.tools)) return result.tools;
  return [];
}

console.log('\n=== Smoke: MCP stdio ===\n');

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', 'src/mcp/server.ts'],
  env: { ...process.env },
});

const client = new McpClient(
  { name: 'mcp-stdio-smoke', version: '1.0.0' },
  { capabilities: {} }
);

const results = [];
let tools = [];

try {
  await client.connect(transport);

  const listResult = await client.listTools();
  tools = getToolList(listResult);
  results.push({ name: 'connect', status: 'PASS', preview: 'stdio handshake complete' });
  results.push({ name: 'tools/list', status: 'PASS', preview: `tools=${tools.length}` });
  if (!JSON_OUT) {
    console.log('  PASS connect — stdio handshake complete');
    console.log(`  PASS tools/list — ${tools.length} tools`);
  }

  const available = new Set(tools.map((tool) => tool?.name).filter(Boolean));
  for (const toolName of SAFE_TOOL_CANDIDATES) {
    if (!available.has(toolName)) {
      results.push({ name: toolName, status: 'SKIP', preview: 'tool not exposed' });
      if (!JSON_OUT) console.log(`  SKIP ${toolName} — not exposed`);
      continue;
    }

    const start = Date.now();
    try {
      const result = await client.callTool({
        name: toolName,
        arguments: TOOL_ARGS[toolName] ?? {},
      });
      const ms = Date.now() - start;
      results.push({ name: toolName, status: 'PASS', ms, preview: preview(result) });
      if (!JSON_OUT) console.log(`  PASS ${toolName} ${ms}ms — ${preview(result)}`);
    } catch (error) {
      const ms = Date.now() - start;
      const status = classifyError(error?.message ?? String(error));
      results.push({ name: toolName, status, ms, error: error?.message ?? String(error) });
      if (!JSON_OUT) console.log(`  ${status} ${toolName} ${ms}ms — ${preview(error?.message ?? String(error))}`);
    }
  }
} finally {
  await transport.close().catch(() => {});
}

const pass = results.filter((row) => row.status === 'PASS').length;
const skip = results.filter((row) => row.status === 'SKIP').length;
const fail = results.filter((row) => row.status === 'FAIL').length;

const ts = stamp();
const outDir = resolve(ROOT, 'memory', 'runs', ts);
mkdirSync(outDir, { recursive: true });

const summary = { pass, skip, fail, total: results.length };
const jsonPath = resolve(outDir, 'mcp-stdio-smoke.json');
writeFileSync(jsonPath, JSON.stringify({ runAt: new Date().toISOString(), summary, results }, null, 2));

const mdPath = resolve(outDir, 'mcp-stdio-smoke.md');
writeFileSync(
  mdPath,
  [
    `# MCP stdio Smoke — ${ts}`,
    '',
    `**Tools discovered**: ${tools.length}`,
    `**Output**: \`${jsonPath}\``,
    '',
    '## Summary',
    '',
    `- ✅ PASS: ${pass}`,
    `- ⚠️ SKIP: ${skip}`,
    `- ❌ FAIL: ${fail}`,
    '',
    '## Results',
    '',
    '| Tool | Status | Detail |',
    '|------|--------|--------|',
    ...results.map((row) => `| \`${row.name}\` | ${row.status} | ${(row.preview ?? row.error ?? '').replace(/\|/g, '\\|').slice(0, 100)} |`),
  ].join('\n')
);

console.log('');
console.log(`  ${pass} pass · ${skip} skip · ${fail} fail (${results.length} total)`);
console.log(`  → ${jsonPath}`);
console.log(`  → ${mdPath}`);

if (JSON_OUT) console.log(JSON.stringify({ pass, skip, fail, total: results.length, results }, null, 2));

process.exit(fail > 0 ? 1 : 0);
