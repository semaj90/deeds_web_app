import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptTreeSitterEvidence } from '../../../scripts/atlas/lib/treesitter-structural-observation-v1.mjs';

const response = { schema: 'atlas.ast.evidence.v1', engine: 'treesitter-chunker', engine_version: '4.0.0', language: 'typescript', syntax_status: 'CLEAN', chunks: [{ upstream_chunk_id: 'chunk-1', node_type: 'function_declaration', kind: 'function', name: 'run', start_byte: 0, end_byte: 10, start_line: 1, end_line: 1, parent_route: ['program'] }], edges: [] };

test('adapts structural evidence with revision identity', () => {
  const result = adaptTreeSitterEvidence({ sourceRef: 'src/example.ts', sourceRevision: `sha256:${'a'.repeat(64)}`, response });
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.chunks.length, 1);
  assert.match(result.chunks[0].evidenceKey, /^ast:/);
  assert.match(result.observationChecksum, /^sha256:/);
});

test('rejects non-content source revisions', () => {
  assert.throws(() => adaptTreeSitterEvidence({ sourceRef: 'src/example.ts', sourceRevision: 'git:head', response }), /SHA256_REQUIRED/);
});
