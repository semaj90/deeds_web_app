#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const writer = fs.readFileSync(path.join(ROOT, 'scripts/atlas/backfill-graphify-file-embeddings-768.mjs'), 'utf8');
const census = fs.readFileSync(path.join(ROOT, 'scripts/atlas/audit-semantic-768-writer-ownership-v1.mjs'), 'utf8');
const legacyRoute = fs.readFileSync(path.join(ROOT, 'sveltekit-frontend/src/routes/api/codebase-index/index-stream/+server.ts'), 'utf8');

test('canonical semantic writer requires proven packet/chunk and workspace/source lineage', () => {
  assert.match(writer, /atlas_packet_chunk_lineage/);
  assert.match(writer, /revision_status\s*=\s*['"]PROVEN['"]/);
  assert.match(writer, /canonical_chunk_id/);
  assert.match(writer, /packet_key/);
  assert.match(writer, /atlas_workspace_source_bindings/);
  assert.match(writer, /workspace_revision/);
  assert.match(writer, /source_revision/);
});

test('canonical semantic writer rechecks identity at update and independently reads it back', () => {
  assert.match(writer, /SEMANTIC_WRITE_CANONICAL_GUARD_REJECTED/);
  assert.match(writer, /readbackCanonicalSemanticRow/);
  assert.match(writer, /SEMANTIC_WRITE_READBACK_IDENTITY_MISMATCH/);
  assert.match(writer, /vector_dims\(c\.content_embedding::vector\)/);
  assert.match(writer, /PASS_CANONICAL_LINEAGE_READBACK/);
});

test('semantic writer remains explicit-apply and does not write Qdrant', () => {
  assert.match(writer, /ATLAS_AUTHORIZE_SEMANTIC_768_BACKFILL/);
  assert.match(writer, /Qdrant\/TurboVec are intentionally not written here/);
  assert.doesNotMatch(writer, /collections\/.+points.*(?:upsert|vectors)/i);
});

test('writer census matches content_embedding exactly rather than content_embedding_768 prefix', () => {
  assert.match(census, /\\bcontent_embedding\\b\(\?!_768\)/);
  assert.match(census, /content_embedding_768/);

  // The live index-stream route is a legacy _768 mirror. It must not be
  // reclassified as the physical content_embedding writer by prefix matching.
  assert.match(legacyRoute, /content_embedding_768/);
  assert.doesNotMatch(legacyRoute, /\bcontent_embedding\b(?!_768)\s*=/);
});
