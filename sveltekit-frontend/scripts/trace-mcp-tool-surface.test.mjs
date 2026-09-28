import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const serverSource = readFileSync(resolve(here, '../src/mcp/trace-mcp-server.ts'), 'utf8');
const auditSource = readFileSync(resolve(here, 'trace-mcp-tool-audit.mjs'), 'utf8');

test('TRACE MCP does not register a generic shell execution tool', () => {
  assert.doesNotMatch(serverSource, /server\.registerTool\(\s*['"]shell\.run['"]/);
});

test('TRACE MCP live tool audit rejects a re-exposed generic shell tool', () => {
  assert.match(auditSource, /FORBIDDEN_TOOL_NAMES\s*=\s*new Set\(\[['"]shell\.run['"]\]\)/);
  assert.match(auditSource, /forbidden\.length === 0/);
});
