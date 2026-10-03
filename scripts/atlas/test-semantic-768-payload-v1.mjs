#!/usr/bin/env node
import assert from 'node:assert/strict';
import { validateSemantic768Payload } from './lib/qdrant-semantic-768-payload-v1.mjs';

const valid = {
  schema_version: 'atlas.semantic-768-qdrant-payload.v1',
  canonical_id: 'chunk:1',
  packet_key: 'packet:1',
  workspace_id: '625743d2-092b-4fa8-abe0-9dc094920c80',
  workspace_revision: `sha256:${'a'.repeat(64)}`,
  repository_id: 'repo:root',
  source_ref: 'src/example.ts',
  source_revision: `sha256:${'b'.repeat(64)}`,
  content_hash: 'c'.repeat(64),
  chunk_id: 'chunk-1',
  representation_id: 'semantic_768',
  representation_revision: 'semantic_768@v1',
  embedding_dimension: 768,
  model_revision: 'embeddinggemma:latest',
  projection_revision: 'projection@v1',
};

assert.equal(validateSemantic768Payload(valid).valid, true);
assert.equal(validateSemantic768Payload(valid, { workspaceRevision: valid.workspace_revision }).valid, true);
assert.equal(validateSemantic768Payload({ ...valid, representation_id: 'legacy_384' }).valid, false);
assert.equal(validateSemantic768Payload({ ...valid, embedding_dimension: 384 }).valid, false);
assert.equal(validateSemantic768Payload({ ...valid, workspace_revision: '0' }).valid, false);
assert.equal(validateSemantic768Payload({ ...valid, source_revision: undefined }).valid, false);
assert.equal(validateSemantic768Payload({ ...valid, workspace_revision: `sha256:${'c'.repeat(64)}` }, { workspaceRevision: valid.workspace_revision }).valid, false);
console.log(JSON.stringify({ schema: 'atlas.semantic-768-qdrant-payload.v1', tests: 7, passed: 7, writesPerformed: false }, null, 2));
