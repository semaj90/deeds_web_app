/** Read-only proof of the existing production MCP/ACP manifest caller. */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectToolsForQuery } from './runtime-mcp-tool-selector.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = path.join(ROOT, 'docs/reports/mcp-production-caller-v1.json');
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

const registry = JSON.parse(await fs.readFile(path.join(ROOT, 'docs/reports/mcp-tool-registry-index.json'), 'utf8'));
const query = 'find graph search and domain classification tools';
const selection = await selectToolsForQuery(query, { topK: 5 });
const body = {
  schema: 'atlas.mcp-production-caller.v1',
  registryPath: 'docs/reports/mcp-tool-registry-index.json',
  registryRevision: registry.content_revision ?? null,
  callers: [
    'sveltekit-frontend/src/mcp/server.ts',
    'sveltekit-frontend/src/routes/api/acp/tools/+server.ts',
  ],
  selector: 'scripts/atlas/runtime-mcp-tool-selector.mjs',
  boundedQueryHint: query,
  topK: 5,
  selectedToolCount: selection.mcp_names?.length ?? 0,
  selectedToolNames: selection.mcp_names ?? [],
  retrievalSource: selection.retrieval_source ?? null,
  registryOk: selection.registry_ok === true,
  embeddingAttempted: selection.embed_ok === true,
  canonicalAuthority: false,
  writesPerformed: false,
  status: selection.mcp_names?.length > 0 && selection.registry_ok === true
    ? 'PROVEN_READ_ONLY_BOUNDED_CALLER'
    : 'INCOMPLETE_BOUNDED_CALLER_PROOF',
};
const report = { generatedAt: new Date().toISOString(), ...body, reportChecksum: sha256(JSON.stringify(body)) };
await fs.writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, selectedToolCount: report.selectedToolCount, retrievalSource: report.retrievalSource, report: 'docs/reports/mcp-production-caller-v1.json' }, null, 2));
