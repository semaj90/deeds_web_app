#!/usr/bin/env node
/**
 * audit-trace-mcp-tool-inventory-v1.mjs
 *
 * Static, read-only inventory of TRACE MCP tool registrations in
 * sveltekit-frontend/src/mcp/trace-mcp-server.ts. It records what the source
 * declares. It does NOT prove runtime availability: a live tools/list needs
 * TRACE on :8788, which was refusing connections when this was written.
 *
 * Output: .tmp/atlas/trace-mcp-tool-inventory-v1.json (writesPerformed:false).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = path.join(ROOT, 'sveltekit-frontend', 'src', 'mcp', 'trace-mcp-server.ts');
const OUT = path.join(ROOT, '.tmp', 'atlas', 'trace-mcp-tool-inventory-v1.json');

const REGISTER = /server\.registerTool\(\s*'([^']+)'/g;
const GATED_DOC = /^\s*\*\s+([a-z][a-z0-9_.-]*)\s+—\s+\[OPERATOR-GATED\]/gim;

export function inventory(source) {
  const names = [...source.matchAll(REGISTER)].map((m) => m[1]);
  const counts = new Map();
  for (const n of names) counts.set(n, (counts.get(n) || 0) + 1);
  const duplicates = [...counts].filter(([, c]) => c > 1).map(([name, count]) => ({ name, count }));
  const gatedDocumented = [...source.matchAll(GATED_DOC)].map((m) => m[1]);
  const gatedRegistered = [...new Set(gatedDocumented)].filter((n) => counts.has(n)).sort();
  return {
    registeredCount: names.length,
    uniqueNames: counts.size,
    duplicates,
    operatorGatedRegistered: gatedRegistered,
    operatorGatedDocumentedOnly: [...new Set(gatedDocumented)].filter((n) => !counts.has(n)).sort(),
  };
}

function main() {
  const source = fs.readFileSync(SOURCE, 'utf8');
  const result = inventory(source);
  const sourceChecksum = `sha256:${crypto.createHash('sha256').update(source, 'utf8').digest('hex')}`;
  const report = {
    schema: 'atlas.trace-mcp-tool-inventory.v1',
    generatedAt: new Date().toISOString(),
    sourcePath: 'sveltekit-frontend/src/mcp/trace-mcp-server.ts',
    sourceChecksum,
    static: true,
    runtimeVerified: false,
    runtimeBlocker: 'TRACE :8788 refused connections (ECONNREFUSED) at the time of the audit',
    ...result,
    canonicalAuthority: false,
    writesPerformed: false,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'TRACE_TOOL_INVENTORY_STATIC',
    registeredCount: result.registeredCount,
    uniqueNames: result.uniqueNames,
    duplicates: result.duplicates.length,
    operatorGatedRegistered: result.operatorGatedRegistered.length,
    runtimeVerified: false,
    reportPath: '.tmp/atlas/trace-mcp-tool-inventory-v1.json',
  }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
