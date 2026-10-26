import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ingestionSource = readFileSync(new URL('../ingest-couchdb-mapreduce.mjs', import.meta.url), 'utf8');
const mcpHealthSource = readFileSync(new URL('../../../sveltekit-frontend/src/mcp/tools/legal-skills.tool.ts', import.meta.url), 'utf8');
const appConsumerSources = [
  'sveltekit-frontend/src/lib/server/couchdb/changes-consumer.ts',
  'sveltekit-frontend/src/lib/server/couchdb/mango-indexes.ts',
  'sveltekit-frontend/src/lib/server/wiki/wiki-couchdb-client.ts',
  'sveltekit-frontend/src/lib/server/agents/regen/loaders/existing-card.ts',
  'sveltekit-frontend/src/lib/server/kb/wiki-logic.ts',
  'sveltekit-frontend/src/lib/server/observability/inference-log.ts',
  'sveltekit-frontend/src/lib/server/services/couchdb-client.ts',
  'sveltekit-frontend/src/lib/server/features/codebase-intel/indexer/directory-summarizer.ts',
  'sveltekit-frontend/src/lib/server/features/codebase-intel/indexer/karpathy-wiki.ts',
  'sveltekit-frontend/src/routes/api/admin/atlas/couchdb-status/+server.ts',
  'sveltekit-frontend/src/routes/api/couchdb/view/+server.ts',
  'sveltekit-frontend/src/routes/api/analytics/qlora-dataset/+server.ts',
].map((path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8'));

test('active legacy CouchDB consumers delegate credentials to the shared fail-closed config owner', () => {
  assert.match(ingestionSource, /resolveCouchDbConfigV1/);
  assert.equal((ingestionSource.match(/resolveCouchDbConfigV1\(\)/g) ?? []).length, 2);
  assert.doesNotMatch(ingestionSource, /COUCHDB_URL\s*\|\|/);
  assert.doesNotMatch(ingestionSource, /COUCH_USER|COUCH_PASS/);
  assert.match(mcpHealthSource, /resolveCouchDbConfigV1/);
  assert.doesNotMatch(mcpHealthSource, /COUCHDB_URL\s*\?\?|COUCHDB_USER\s*\?\?|COUCHDB_PASSWORD\s*\?\?/);
  for (const source of appConsumerSources) {
    assert.match(source, /resolveCouchDbConfigV1/);
    assert.doesNotMatch(source, /COUCHDB_URL\s*\?\?|COUCHDB_USER\s*\?\?|COUCHDB_PASS(?:WORD)?\s*\?\?/);
    assert.doesNotMatch(source, /ENV\.COUCHDB_URL|parseCouchUrl\(|COUCHDB_URL\s*=\s*stripCredentials/);
  }
});
