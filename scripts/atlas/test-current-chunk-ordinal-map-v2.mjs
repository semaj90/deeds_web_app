#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(ROOT, 'scripts/atlas/materialize-current-chunk-ordinal-map-v2.mts'), 'utf8');

test('requires explicit revision-qualified workspace selection', () => {
  assert.match(source, /CURRENT_CHUNK_ORDINAL_MAP_EXPLICIT_WORKSPACE_REVISION_REQUIRED/);
  assert.match(source, /workspace_revision::text = \$1/);
});

test('uses canonical packet chunk lineage as candidate identity owner', () => {
  assert.match(source, /atlas_packet_chunk_lineage/);
  assert.match(source, /revision_status = 'PROVEN'/);
  assert.match(source, /canonical_chunk_id/);
  assert.match(source, /packet_key/);
  assert.match(source, /HAVING count\(\*\) = 1/);
  assert.match(source, /canonicalId: row\.canonical_chunk_id/);
});

test('requires exact workspace source binding and preserves source revisions', () => {
  assert.match(source, /atlas_workspace_source_bindings/);
  assert.match(source, /b\.source_revision = l\.source_revision/);
  assert.match(source, /workspaceRevision: row\.workspace_revision/);
  assert.match(source, /sourceRevision: row\.source_revision/);
});

test('does not fabricate semantic or graph revisions', () => {
  assert.match(source, /graphRevision: null/);
  assert.match(source, /semanticRevision: null/);
  assert.match(source, /representationBindings: \[\]/);
  assert.doesNotMatch(source, /content_embedding_768/);
});

test('emits a canonical-chunk identity receipt and source revision set checksum', () => {
  assert.match(source, /identityGrain: 'CANONICAL_CHUNK'/);
  assert.match(source, /sourceRevisionSetChecksum/);
  assert.match(source, /ordinalMapChecksum/);
  assert.match(source, /identityOwner: 'atlas_packet_chunk_lineage'/);
});
