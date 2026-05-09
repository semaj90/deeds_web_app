import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();

const contextSource = await readFile(resolve(root, 'src/lib/server/admin/ai-chat-context.ts'), 'utf8');
const serviceSource = await readFile(resolve(root, 'src/lib/server/admin/ai-chat-service.ts'), 'utf8');
const routeSource = await readFile(resolve(root, 'src/routes/api/admin/ai-chat/+server.ts'), 'utf8');

const requiredTools = [
  'kb.hybrid_search',
  'kb.search_pathways',
  'kb.search_notecards',
  'kb.explain_context_pack',
  'search.rerank',
  'graph.semantic_path_synthesis',
  'topology.search_som_neighborhood',
];

const forbiddenTools = [
  'graph.materialize_pathway',
  'hypergraph.materialize_pathway',
  'shell.',
  'cache.delete_',
  'rabbitmq.publish_',
];

for (const tool of requiredTools) {
  assert.match(contextSource, new RegExp(tool.replaceAll('.', '\\.')), `missing allowed tool: ${tool}`);
}

for (const tool of forbiddenTools) {
  assert.ok(!contextSource.includes(tool), `forbidden tool present in allowlist source: ${tool}`);
}

assert.match(serviceSource, /buildAdminChatDegradedPayload/, 'degraded payload helper missing');
assert.match(serviceSource, /degraded:\s*true/, 'degraded payload should set degraded=true');
assert.match(serviceSource, /TRACE MCP|Degraded signals/, 'degraded payload should explain failures');
assert.match(routeSource, /locals\.user\?\.role !== 'admin'/, 'admin auth guard missing');
assert.match(routeSource, /sessionId: z\.string\(\)\.uuid\(\)\.optional\(\)/, 'sessionId should be optional uuid');

console.log('admin-ai-chat smoke passed');
