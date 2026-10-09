import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('Graphify packet export preserves null source revisions without substitutions', async () => {
  const source = await fs.readFile(new URL('../export-graphify-file-index-v1.mjs', import.meta.url), 'utf8');

  assert.match(source, /'source_revision',\s*ap\.source_revision\s*,/);
  assert.doesNotMatch(source, /'source_revision',\s*COALESCE\([^\n]*(?:content_hash|sha256|workspace_revision)/);
});
